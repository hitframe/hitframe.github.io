import Foundation

/// Un colpo: secondi dal beep, e se il polso ha sentito il rinculo (nil = sensore non disponibile).
struct Colpo: Codable, Hashable {
    var t: Double
    var rinculo: Bool?
}

/// Una run registrata dal timer.
struct Run: Codable, Identifiable, Hashable {
    var id = UUID()
    var data = Date()
    var titolo = "Run"
    var colpi: [Colpo] = []
    var par: Double?
    var ritardo: Double = 0
    var soglia: Double = 0.6
    var filtroRinculo = false

    /// I colpi che contano: con il filtro attivo, solo quelli con il rinculo al polso.
    var validi: [Colpo] {
        guard filtroRinculo, colpi.contains(where: { $0.rinculo != nil }) else { return colpi }
        return colpi.filter { $0.rinculo != false }
    }
    var tempo: Double? { validi.last?.t }
    var primo: Double? { validi.first?.t }
    var split: [Double] {
        let v = validi.map(\.t)
        return v.count < 2 ? [] : (1..<v.count).map { v[$0] - v[$0 - 1] }
    }

    /// Stesso formato di GDA Split: Hitframe lo importa così com'è.
    func jsonPerHitframe() -> Data? {
        var prev = 0.0
        let shots: [[String: Any]] = validi.enumerated().map { i, c in
            defer { prev = c.t }
            let sp = c.t - prev
            return ["n": i + 1, "t": (c.t * 1000).rounded() / 1000, "split": (sp * 1000).rounded() / 1000,
                    "kind": i == 0 ? "Primo colpo" : (sp >= 0.5 ? "Transizione" : "Split")]
        }
        var o: [String: Any] = [
            "stage": titolo, "file": "Apple Watch", "date": ISO8601DateFormatter().string(from: data),
            "total": tempo.map { ($0 * 1000).rounded() / 1000 } as Any, "shots": shots, "fonte": "Hitframe Timer",
        ]
        if let par { o["plan"] = par }
        return try? JSONSerialization.data(withJSONObject: o, options: [.prettyPrinted])
    }
}

/// Lo storico delle run, salvato sull'orologio.
@MainActor
final class Archivio: ObservableObject {
    @Published private(set) var runs: [Run] = []
    private let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("runs.json")

    init() {
        if let d = try? Data(contentsOf: url), let r = try? JSONDecoder().decode([Run].self, from: d) { runs = r }
    }
    func aggiungi(_ r: Run) { runs.insert(r, at: 0); salva() }
    func elimina(_ ids: Set<UUID>) { runs.removeAll { ids.contains($0.id) }; salva() }
    private func salva() { try? JSONEncoder().encode(runs).write(to: url, options: .atomic) }
}

extension Double {
    /// 1,23
    var s2: String { String(format: "%.2f", self).replacingOccurrences(of: ".", with: ",") }
}
