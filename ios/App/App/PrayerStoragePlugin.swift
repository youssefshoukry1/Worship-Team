import Capacitor
import Foundation
import CoreFoundation
import CryptoKit

enum PrayerIndexStorage {
    struct Snapshot { let data: String?; let fingerprint: String }
    enum Failure: LocalizedError {
        case conflict, invalid, missing
        var errorDescription: String? {
            switch self {
            case .conflict: return "Prayer storage changed. Please retry."
            case .invalid: return "Prayer storage is invalid or unsupported."
            case .missing: return "No saved prayer index."
            }
        }
    }
    private static let queue = DispatchQueue(label: "wasla.prayer.index")
    static var root: URL { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("my_prays") }
    static func validate(_ bytes: Data) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw Failure.invalid }
        if let version = value["version"] {
            guard let number = version as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue == 1 else { throw Failure.invalid }
        }
        if let prayers = value["guestPrays"] {
            guard let list = prayers as? [[String: Any]], list.allSatisfy({ $0["_id"] != nil && !($0["_id"] is NSNull) }) else { throw Failure.invalid }
        }
        for key in ["recordings", "pendingWords", "revokedPrayerShares", "prayerDeletionCursors"] {
            if let item = value[key], !(item is [String: Any]) { throw Failure.invalid }
        }
        if let groups = value["recordings"] as? [String: Any] {
            for clips in groups.values {
                guard let list = clips as? [[String: Any]], list.allSatisfy({ $0["id"] != nil && !($0["id"] is NSNull) }) else { throw Failure.invalid }
            }
        }
        return value
    }
    private static func fingerprint(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
    private static func readLocked(_ root: URL) throws -> Snapshot {
        let bytes: Data
        do { bytes = try Data(contentsOf: root.appendingPathComponent("index.json")) }
        catch {
            let failure = error as NSError
            if failure.domain == NSCocoaErrorDomain && failure.code == NSFileReadNoSuchFileError { return Snapshot(data: nil, fingerprint: "missing") }
            throw error
        }
        _ = try validate(bytes)
        guard let text = String(data: bytes, encoding: .utf8) else { throw Failure.invalid }
        return Snapshot(data: text, fingerprint: fingerprint(bytes))
    }
    static func read(_ root: URL) throws -> Snapshot { try queue.sync { try readLocked(root) } }
    static func readObject(_ root: URL) throws -> [String: Any] {
        guard let text = try read(root).data, let bytes = text.data(using: .utf8) else { throw Failure.missing }
        return try validate(bytes)
    }
    static func write(_ root: URL, expected: String, data: String) throws -> Snapshot {
        let bytes = Data(data.utf8)
        _ = try validate(bytes)
        return try queue.sync {
            let current = try readLocked(root)
            guard current.fingerprint == expected else { throw Failure.conflict }
            if current.data == data { return current }
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            try bytes.write(to: root.appendingPathComponent("index.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            let committed = try readLocked(root)
            guard committed.fingerprint == fingerprint(bytes) else { throw Failure.invalid }
            return committed
        }
    }
}

@objc(PrayerStoragePlugin)
final class PrayerStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "PrayerStoragePlugin"
    let jsName = "PrayerStorage"
    let pluginMethods = ["readIndex", "writeIndex"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let work = DispatchQueue(label: "wasla.prayer.storage.bridge")
    private func resolve(_ call: CAPPluginCall, _ value: PrayerIndexStorage.Snapshot) {
        call.resolve(["data": value.data.map { $0 as Any } ?? NSNull(), "fingerprint": value.fingerprint])
    }
    @objc func readIndex(_ call: CAPPluginCall) {
        work.async {
            do { self.resolve(call, try PrayerIndexStorage.read(PrayerIndexStorage.root)) }
            catch { call.reject("Could not read saved prayers", "PRAYER_STORAGE_READ", error) }
        }
    }
    @objc func writeIndex(_ call: CAPPluginCall) {
        guard let expected = call.getString("expectedFingerprint"), let data = call.getString("data") else {
            call.reject("Missing prayer transaction parameters", "PRAYER_STORAGE_WRITE"); return
        }
        work.async {
            do { self.resolve(call, try PrayerIndexStorage.write(PrayerIndexStorage.root, expected: expected, data: data)) }
            catch PrayerIndexStorage.Failure.conflict { call.reject("Prayer storage changed. Please retry.", "PRAYER_STORAGE_CONFLICT") }
            catch { call.reject("Could not commit saved prayers", "PRAYER_STORAGE_WRITE", error) }
        }
    }
}
