import AVFoundation
import CoreMotion
import Foundation
import WatchKit

/// Orologio comune: secondi dal tempo assoluto della macchina (lo stesso di audio e sensori).
@inline(__always) func adesso() -> Double { AVAudioTime.seconds(forHostTime: mach_absolute_time()) }

/// Il timer: ritardo, beep e vibrazione, ascolto dei colpi dal microfono, rinculo dal polso.
@MainActor
final class TimerIPSC: NSObject, ObservableObject {
    enum Stato: Equatable { case fermo, attesa, ascolto, finito }

    @Published var stato: Stato = .fermo
    @Published var colpi: [Colpo] = []
    @Published var trascorso: Double = 0
    @Published var errore: String?
    @Published var ultima: Run?

    // impostazioni (lette all'avvio di ogni run)
    var ritardoMin = 1.0, ritardoMax = 4.0
    var par: Double?
    var soglia = 0.6 // ampiezza minima del colpo (0–1 del fondo scala)
    var filtroRinculo = false
    var stopDopo = 5.0 // secondi di silenzio dopo l'ultimo colpo per chiudere da sola

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let moto = CMMotionManager()
    private var sessione: WKExtendedRuntimeSession?
    private var t0 = 0.0 // il beep, in secondi macchina
    private var ritardo = 0.0
    private var picchiRinculo: [Double] = []
    private var orologio: Timer?
    private var timerPar: DispatchWorkItem?
    private var timerBeep: DispatchWorkItem?

    // rilevamento (thread audio)
    private let rilevatore = Rilevatore()

    func avvia() {
        guard stato == .fermo || stato == .finito else { return }
        errore = nil
        colpi = []
        trascorso = 0
        picchiRinculo = []
        ritardo = ritardoMin >= ritardoMax ? ritardoMin : Double.random(in: ritardoMin...ritardoMax)
        tieniSveglio()
        AVAudioApplication.requestRecordPermission { ok in
            Task { @MainActor in
                guard ok else { self.errore = "Serve il permesso del microfono: Impostazioni › Privacy."; self.stato = .fermo; return }
                self.partenza()
            }
        }
    }

    private func partenza() {
        do {
            let s = AVAudioSession.sharedInstance()
            try s.setCategory(.playAndRecord, mode: .measurement)
            try s.setActive(true)
            if !engine.attachedNodes.contains(player) {
                engine.attach(player)
                engine.connect(player, to: engine.mainMixerNode, format: Beep.formato)
            }
            let input = engine.inputNode
            let fmt = input.outputFormat(forBus: 0)
            rilevatore.prepara(sr: fmt.sampleRate, soglia: Float(soglia))
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: fmt) { [weak self] buf, quando in
                guard let self else { return }
                let nuovi = self.rilevatore.analizza(buf, quando)
                if !nuovi.isEmpty { Task { @MainActor in self.registra(nuovi) } }
            }
            try engine.start()
        } catch {
            self.errore = "Audio non disponibile: \(error.localizedDescription)"
            stato = .fermo
            return
        }
        avviaSensore()
        stato = .attesa
        // beep e vibrazione nello stesso istante, fissato sull'orologio dell'audio
        let host = mach_absolute_time() + AVAudioTime.hostTime(forSeconds: ritardo)
        t0 = AVAudioTime.seconds(forHostTime: host)
        rilevatore.imposta(t0: t0, ignoraFinoA: t0 + Beep.durata + 0.05)
        player.scheduleBuffer(Beep.buffer(), at: nil)
        player.play(at: AVAudioTime(hostTime: host))
        let vib = DispatchWorkItem { [weak self] in
            WKInterfaceDevice.current().play(.start)
            self?.stato = .ascolto
            self?.avviaOrologio()
        }
        timerBeep = vib
        DispatchQueue.main.asyncAfter(deadline: .now() + ritardo, execute: vib)
        if let par {
            let p = DispatchWorkItem { [weak self] in
                guard let self, self.stato == .ascolto else { return }
                self.player.scheduleBuffer(Beep.buffer(), at: nil)
                self.player.play()
                WKInterfaceDevice.current().play(.stop)
            }
            timerPar = p
            DispatchQueue.main.asyncAfter(deadline: .now() + ritardo + par, execute: p)
        }
    }

    private func avviaOrologio() {
        orologio?.invalidate()
        orologio = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.stato == .ascolto else { return }
                self.trascorso = adesso() - self.t0
                let ultimo = self.colpi.last?.t ?? 0
                if (!self.colpi.isEmpty && self.trascorso - ultimo > self.stopDopo) || self.trascorso > 180 { self.ferma() }
            }
        }
    }

    private func registra(_ tempi: [Double]) {
        guard stato == .ascolto || stato == .attesa else { return }
        for t in tempi where t > 0 { colpi.append(Colpo(t: t, rinculo: nil)) }
        if !tempi.isEmpty { WKInterfaceDevice.current().play(.click) }
    }

    /// Il rinculo: picchi dell'accelerometro (100 al secondo) sopra 2 g rispetto alla gravità.
    private func avviaSensore() {
        guard moto.isAccelerometerAvailable else { return }
        moto.accelerometerUpdateInterval = 1.0 / 100
        let coda = OperationQueue()
        var ultimo = 0.0
        moto.startAccelerometerUpdates(to: coda) { [weak self] d, _ in
            guard let d else { return }
            let g = (d.acceleration.x * d.acceleration.x + d.acceleration.y * d.acceleration.y + d.acceleration.z * d.acceleration.z).squareRoot()
            if abs(g - 1) > 2.0, d.timestamp - ultimo > 0.05 {
                ultimo = d.timestamp
                let t = d.timestamp
                Task { @MainActor in self?.picchiRinculo.append(t) }
            }
        }
    }

    func ferma() {
        guard stato != .fermo, stato != .finito else { return }
        let eraInAttesa = stato == .attesa
        timerBeep?.cancel(); timerPar?.cancel(); orologio?.invalidate()
        engine.inputNode.removeTap(onBus: 0)
        player.stop()
        engine.stop()
        moto.stopAccelerometerUpdates()
        try? AVAudioSession.sharedInstance().setActive(false)
        sessione?.invalidate(); sessione = nil
        if eraInAttesa { stato = .fermo; return }
        // abbina i picchi del polso ai colpi (il rinculo arriva insieme al suono)
        let haSensore = !picchiRinculo.isEmpty || moto.isAccelerometerAvailable
        let picchi = picchiRinculo.map { $0 - t0 }
        let marcati = colpi.map { c in
            Colpo(t: c.t, rinculo: haSensore ? picchi.contains { $0 > c.t - 0.04 && $0 < c.t + 0.12 } : nil)
        }
        colpi = marcati
        var r = Run(colpi: marcati, par: par, ritardo: ritardo, soglia: soglia, filtroRinculo: filtroRinculo)
        r.titolo = DateFormatter.localizedString(from: r.data, dateStyle: .none, timeStyle: .short)
        ultima = r
        stato = .finito
        WKInterfaceDevice.current().play(.success)
    }

    func nuova() { stato = .fermo; colpi = []; trascorso = 0 }

    /// Tiene l'app attiva anche a polso abbassato durante la run.
    private func tieniSveglio() {
        let s = WKExtendedRuntimeSession()
        s.start()
        sessione = s
    }
}

/// Riconosce i colpi nel flusso audio: un picco sopra soglia, ben sopra il rumore di fondo, a distanza minima dal precedente.
final class Rilevatore: @unchecked Sendable {
    private let lock = NSLock()
    private var sr = 48000.0
    private var soglia: Float = 0.6
    private var t0 = 0.0
    private var ignoraFinoA = 0.0
    private var ultimo = -1.0
    private var fondo: Float = 0.01
    private let refrattario = 0.06 // nessuno tira due colpi in meno di 60 ms

    func prepara(sr: Double, soglia: Float) { lock.lock(); self.sr = sr; self.soglia = soglia; ultimo = -1; fondo = 0.01; lock.unlock() }
    func imposta(t0: Double, ignoraFinoA: Double) { lock.lock(); self.t0 = t0; self.ignoraFinoA = ignoraFinoA; lock.unlock() }

    /// Restituisce i colpi trovati nel buffer, in secondi dal beep.
    func analizza(_ buf: AVAudioPCMBuffer, _ quando: AVAudioTime) -> [Double] {
        guard let ch = buf.floatChannelData?[0], quando.isHostTimeValid else { return [] }
        lock.lock(); defer { lock.unlock() }
        let inizio = AVAudioTime.seconds(forHostTime: quando.hostTime)
        let n = Int(buf.frameLength)
        var out: [Double] = []
        for i in 0..<n {
            let a = abs(ch[i])
            let t = inizio + Double(i) / sr
            if a >= soglia && a > fondo * 6 && t >= ignoraFinoA && (ultimo < 0 || t - ultimo >= refrattario) {
                ultimo = t
                out.append(t - t0)
            }
            fondo += (a - fondo) * 0.0005 // rumore di fondo lento (circa 40 ms)
        }
        return out
    }
}

/// Il beep di partenza: 3 kHz per 0,3 s, come i timer da gara.
enum Beep {
    static let durata = 0.3
    static let formato = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
    static func buffer() -> AVAudioPCMBuffer {
        let n = AVAudioFrameCount(48000 * durata)
        let b = AVAudioPCMBuffer(pcmFormat: formato, frameCapacity: n)!
        b.frameLength = n
        let p = b.floatChannelData![0]
        for i in 0..<Int(n) {
            let t = Double(i) / 48000
            let inv = min(1, min(t, durata - t) / 0.005) // bordi morbidi, niente clic
            p[i] = Float(sin(2 * .pi * 3000 * t) * 0.95 * inv)
        }
        return b
    }
}
