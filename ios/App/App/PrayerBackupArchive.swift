import Foundation

enum PrayerBackupError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(text) = self { return text }; return nil }
}

/// A streaming ZIP (STORE) writer. No recording is loaded into memory as a whole.
/// prays.json and audio/<prayer>/<recording> remain compatible with the existing restore UI.
enum PrayerBackupArchive {
    struct Entry { let name: String; let file: URL?; let data: Data? }
    static func component(_ value: String) throws -> String {
        guard !value.isEmpty, value != ".", value != "..", !value.contains("/"), !value.contains("\\") else { throw PrayerBackupError.message("Invalid recording path") }
        return value
    }
    static func read(_ url: URL) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] else { throw PrayerBackupError.message("Prayer data could not be read") }
        return value
    }
    static func build(root: URL, output: URL, userId: String, progress: (Int) throws -> Void) throws {
        let snapshot = try read(root.appendingPathComponent("backup-prayers.json"))
        guard snapshot["userId"] as? String == userId else { throw PrayerBackupError.message("Open your prayer page before backing up this account") }
        let indexURL = root.appendingPathComponent("index.json")
        let index = try read(indexURL)
        let recordings = index["recordings"] as? [String: [[String: Any]]] ?? [:]
        var prayers: [String: [String: Any]] = [:]
        for p in index["guestPrays"] as? [[String: Any]] ?? [] {
            if let id = p["_id"] as? String { prayers[id] = p }
        }
        guard !prayers.isEmpty || !recordings.isEmpty || !(index["revokedPrayerShares"] as? [String: Any] ?? [:]).isEmpty else { throw PrayerBackupError.message("No prayers to back up yet") }
        var entries: [Entry] = [], withFiles: [String: [[String: Any]]] = [:]
        for (id, list) in recordings {
            _ = try component(id)
            withFiles[id] = try list.map { original in
                var rec = original
                let name = try component(rec["id"] as? String ?? "") + "." + component(rec["ext"] as? String ?? "")
                let path = "audio/\(id)/\(name)"
                let file = root.appendingPathComponent("audio").appendingPathComponent(name)
                guard FileManager.default.isReadableFile(atPath: file.path) else { throw PrayerBackupError.message("A recording is missing. Your previous backup has been kept.") }
                entries.append(Entry(name: path, file: file, data: nil)); rec["file"] = path; return rec
            }
        }
        let prays: [[String: Any]] = prayers.map { id, prayer in
            var copy = prayer.filter { ["_id", "words", "feeling", "prayType", "churchId", "date", "sharedWith", "sharedFrom"].contains($0.key) }
            copy["recordings"] = withFiles[id] ?? []; return copy
        }
        let others: [[String: Any]] = recordings.keys.filter { prayers[$0] == nil }.map { id in
            var group: [String: Any] = ["prayId": id, "recordings": withFiles[id] ?? []]
            if let pending = (index["pendingWords"] as? [String: String])?[id] { group["pendingWords"] = pending }; return group
        }
        let manifest: [String: Any] = ["type": "my-prays-backup", "version": 1, "createdAt": ISO8601DateFormatter().string(from: Date()), "prays": prays, "otherRecordings": others, "revokedPrayerShares": index["revokedPrayerShares"] ?? [:]]
        entries.append(Entry(name: "prays.json", file: nil, data: try JSONSerialization.data(withJSONObject: manifest)))
        try write(entries, to: output, progress: progress)
    }
    private static let crcTable: [UInt32] = (0..<256).map { n in
        var value = UInt32(n); for _ in 0..<8 { value = value & 1 == 1 ? 0xedb88320 ^ (value >> 1) : value >> 1 }; return value
    }
    private static func chunks(_ entry: Entry, _ body: (Data) throws -> Void) throws {
        if let data = entry.data { try body(data); return }
        guard let url = entry.file else { return }
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        while let bytes = try handle.read(upToCount: 65536), !bytes.isEmpty { try body(bytes) }
    }
    private static func write(_ entries: [Entry], to url: URL, progress: (Int) throws -> Void) throws {
        guard entries.count < 65535 else { throw PrayerBackupError.message("Too many recordings for this backup") }
        FileManager.default.createFile(atPath: url.path, contents: nil, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        let output = try FileHandle(forWritingTo: url); defer { try? output.close() }
        var central = Data(), offset: UInt64 = 0
        for (index, entry) in entries.enumerated() {
            var crc: UInt32 = 0xffffffff, size: UInt64 = 0
            try chunks(entry) { bytes in
                try progress(5 + index * 35 / max(1, entries.count))
                size += UInt64(bytes.count)
                for byte in bytes { crc = crcTable[Int((crc ^ UInt32(byte)) & 255)] ^ (crc >> 8) }
            }
            crc ^= 0xffffffff
            let name = Data(entry.name.utf8)
            guard size < UInt32.max, offset + size + 65536 < UInt32.max, name.count < 65535 else { throw PrayerBackupError.message("Backup exceeds the 4 GB archive limit") }
            var header = Data(); header.le32(0x04034b50); header.le16(20); header.le16(0x800); header.le16(0); header.le16(0); header.le16(0x21)
            header.le32(crc); header.le32(UInt32(size)); header.le32(UInt32(size)); header.le16(UInt16(name.count)); header.le16(0); header.append(name)
            try output.write(contentsOf: header)
            try chunks(entry) { bytes in try progress(5 + index * 35 / max(1, entries.count)); try output.write(contentsOf: bytes) }
            central.le32(0x02014b50); central.le16(20); central.le16(20); central.le16(0x800); central.le16(0); central.le16(0); central.le16(0x21)
            central.le32(crc); central.le32(UInt32(size)); central.le32(UInt32(size)); central.le16(UInt16(name.count)); central.le16(0); central.le16(0); central.le16(0); central.le16(0); central.le32(0); central.le32(UInt32(offset)); central.append(name)
            offset += UInt64(header.count) + size
        }
        try output.write(contentsOf: central)
        var end = Data(); end.le32(0x06054b50); end.le16(0); end.le16(0); end.le16(UInt16(entries.count)); end.le16(UInt16(entries.count)); end.le32(UInt32(central.count)); end.le32(UInt32(offset)); end.le16(0)
        try output.write(contentsOf: end); try output.synchronize(); try progress(40)
    }
}
private extension Data {
    mutating func le16(_ value: UInt16) { var n = value.littleEndian; Swift.withUnsafeBytes(of: &n) { append(contentsOf: $0) } }
    mutating func le32(_ value: UInt32) { var n = value.littleEndian; Swift.withUnsafeBytes(of: &n) { append(contentsOf: $0) } }
}
