import SwiftUI

@main
struct HitframeTimerApp: App {
    @StateObject private var timer = TimerIPSC()
    @StateObject private var archivio = Archivio()
    var body: some Scene {
        WindowGroup {
            Principale()
                .environmentObject(timer)
                .environmentObject(archivio)
                .tint(.giallo)
        }
    }
}

extension Color {
    static let giallo = Color(red: 0.898, green: 0.918, blue: 0.118)
    static let nero = Color(red: 0.043, green: 0.043, blue: 0.047)
}

struct Principale: View {
    @EnvironmentObject var timer: TimerIPSC
    @EnvironmentObject var archivio: Archivio
    @AppStorage("ritardo") private var ritardo = "casuale"
    @AppStorage("par") private var par = 0.0
    @AppStorage("soglia") private var soglia = 0.6
    @AppStorage("filtro") private var filtro = false
    @AppStorage("stopDopo") private var stopDopo = 5.0

    var body: some View {
        NavigationStack {
            Group {
                switch timer.stato {
                case .fermo: pronto
                case .attesa: InCorso(attesa: true)
                case .ascolto: InCorso(attesa: false)
                case .finito: Risultato(run: timer.ultima)
                }
            }
            .toolbar(timer.stato == .fermo ? .visible : .hidden)
        }
    }

    private var pronto: some View {
        VStack(spacing: 8) {
            Button(action: avvia) {
                Text("START")
                    .font(.system(size: 30, weight: .black).italic())
                    .foregroundStyle(Color.nero)
                    .frame(width: 112, height: 112)
                    .background(Circle().fill(Color.giallo))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Avvia il timer")
            Text(riepilogo).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            if let e = timer.errore { Text(e).font(.footnote).foregroundStyle(.red) }
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                NavigationLink { Storico() } label: { Image(systemName: "list.bullet") }.accessibilityLabel("Storico")
            }
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { Impostazioni() } label: { Image(systemName: "gearshape") }.accessibilityLabel("Impostazioni")
            }
        }
    }

    private var riepilogo: String {
        let r = ritardo == "casuale" ? "ritardo 1–4 s" : ritardo == "fisso" ? "ritardo 3 s" : "subito"
        return par > 0 ? "\(r) · par \(par.s2)" : r
    }

    private func avvia() {
        switch ritardo {
        case "fisso": timer.ritardoMin = 3; timer.ritardoMax = 3
        case "subito": timer.ritardoMin = 1; timer.ritardoMax = 1
        default: timer.ritardoMin = 1; timer.ritardoMax = 4
        }
        timer.par = par > 0 ? par : nil
        timer.soglia = soglia
        timer.filtroRinculo = filtro
        timer.stopDopo = stopDopo
        timer.avvia()
    }
}

/// Durante la run: tempo che scorre, colpi, ultimo split. Tocca per fermare.
struct InCorso: View {
    @EnvironmentObject var timer: TimerIPSC
    let attesa: Bool
    var body: some View {
        Button { timer.ferma() } label: {
            VStack(spacing: 4) {
                if attesa {
                    Text("PRONTO").font(.system(size: 34, weight: .black).italic()).foregroundStyle(Color.giallo)
                    Text("Aspetta il beep").font(.footnote).foregroundStyle(.secondary)
                } else {
                    Text(timer.trascorso.s2)
                        .font(.system(size: 46, weight: .black).italic().monospacedDigit())
                    Text("\(timer.colpi.count) colpi").font(.headline)
                    if timer.colpi.count >= 2 {
                        let c = timer.colpi
                        Text("split \((c[c.count - 1].t - c[c.count - 2].t).s2)").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Text("Tocca per fermare").font(.caption2).foregroundStyle(.secondary).padding(.top, 6)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(attesa ? "Annulla" : "Ferma il timer")
    }
}

/// Fine run: tempo, primo colpo, split. I colpi senza rinculo al polso sono segnati.
struct Risultato: View {
    @EnvironmentObject var timer: TimerIPSC
    @EnvironmentObject var archivio: Archivio
    let run: Run?
    @State private var salvata = false

    var body: some View {
        if let run {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 2) {
                        Text((run.tempo ?? 0).s2 + " s").font(.system(size: 34, weight: .black).italic().monospacedDigit())
                        Text("\(run.validi.count) colpi · primo \((run.primo ?? 0).s2)").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Section("Colpi") { ElencoColpi(run: run) }
                Section {
                    Button(salvata ? "Salvata" : "Salva") { archivio.aggiungi(run); salvata = true }.disabled(salvata)
                    Button("Nuova run") { salvata = false; timer.nuova() }
                }
            }
        }
    }
}

struct ElencoColpi: View {
    let run: Run
    var body: some View {
        let validi = Set(run.validi.map(\.t))
        ForEach(Array(run.colpi.enumerated()), id: \.offset) { i, c in
            let prima = run.colpi[..<i].last(where: { validi.contains($0.t) })?.t ?? 0
            HStack {
                Text("\(i + 1)").foregroundStyle(.secondary).frame(width: 22, alignment: .leading)
                Text(c.t.s2).monospacedDigit()
                Spacer()
                if validi.contains(c.t) {
                    Text("+" + (c.t - prima).s2).monospacedDigit().foregroundStyle(c.t - prima >= 0.5 ? Color.giallo : .secondary)
                } else {
                    Text("altra linea").font(.caption2).foregroundStyle(.secondary)
                }
                if c.rinculo == true { Image(systemName: "hand.raised.fill").font(.caption2).foregroundStyle(.secondary).accessibilityLabel("rinculo al polso") }
            }
        }
    }
}

struct Storico: View {
    @EnvironmentObject var archivio: Archivio
    var body: some View {
        List {
            if archivio.runs.isEmpty { Text("Nessuna run salvata.").foregroundStyle(.secondary) }
            ForEach(archivio.runs) { r in
                NavigationLink {
                    List { ElencoColpi(run: r) }.navigationTitle((r.tempo ?? 0).s2 + " s")
                } label: {
                    VStack(alignment: .leading) {
                        Text((r.tempo ?? 0).s2 + " s").font(.headline.monospacedDigit())
                        Text(r.data.formatted(date: .abbreviated, time: .shortened) + " · \(r.validi.count) colpi").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            .onDelete { idx in archivio.elimina(Set(idx.map { archivio.runs[$0].id })) }
        }
        .navigationTitle("Storico")
    }
}

struct Impostazioni: View {
    @AppStorage("ritardo") private var ritardo = "casuale"
    @AppStorage("par") private var par = 0.0
    @AppStorage("soglia") private var soglia = 0.6
    @AppStorage("filtro") private var filtro = false
    @AppStorage("stopDopo") private var stopDopo = 5.0

    var body: some View {
        Form {
            Picker("Ritardo", selection: $ritardo) {
                Text("Casuale 1–4 s").tag("casuale")
                Text("Fisso 3 s").tag("fisso")
                Text("Subito (1 s)").tag("subito")
            }
            Section("Par time") {
                Stepper(par > 0 ? "\(par.s2) s" : "Nessuno", value: $par, in: 0...30, step: 0.25)
            }
            Section {
                Slider(value: $soglia, in: 0.2...0.95, step: 0.05) { Text("Sensibilità") }
                Text("Soglia \(Int(soglia * 100))%: più bassa sente più colpi, anche quelli delle altre linee.").font(.caption2).foregroundStyle(.secondary)
            } header: { Text("Microfono") }
            Section {
                Toggle("Solo i miei colpi", isOn: $filtro)
                Text("Conta solo i colpi con il rinculo al polso: indossa l'orologio sulla mano forte.").font(.caption2).foregroundStyle(.secondary)
            }
            Section("Fine automatica") {
                Stepper("Dopo \(Int(stopDopo)) s di silenzio", value: $stopDopo, in: 2...15, step: 1)
            }
        }
        .navigationTitle("Impostazioni")
    }
}
