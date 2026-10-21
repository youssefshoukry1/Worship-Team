import Capacitor
import Foundation
import BackgroundTasks
import Security
import UIKit
import UserNotifications

@objc(PrayerBackupPlugin)
final class PrayerBackupPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "PrayerBackupPlugin"
    let jsName = "PrayerBackup"
    let pluginMethods = ["configure", "getStatus", "runNow", "suspend", "setOwner"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private var notifications: BackupNotificationHandler?
    override func load() {
        guard let router = bridge?.notificationRouter else { return }
        let handler = BackupNotificationHandler(base: router.localNotificationHandler)
        notifications = handler; router.localNotificationHandler = handler
    }
    @objc func configure(_ call: CAPPluginCall) {
        do {
            try PrayerBackupEngine.shared.configure(call.options as? [String: Any] ?? [:])
            call.resolve(PrayerBackupEngine.shared.status())
        } catch { call.reject(error.localizedDescription) }
    }
    @objc func getStatus(_ call: CAPPluginCall) { call.resolve(PrayerBackupEngine.shared.status()) }
    @objc func runNow(_ call: CAPPluginCall) { PrayerBackupEngine.shared.start(); call.resolve() }
    @objc func suspend(_ call: CAPPluginCall) { PrayerBackupEngine.shared.suspend(); call.resolve() }
    @objc func setOwner(_ call: CAPPluginCall) {
        do {
            let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("my_prays")
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: ["userId": call.getString("userId") ?? ""])
            try data.write(to: root.appendingPathComponent("backup-prayers.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            call.resolve()
        } catch { call.reject("Could not prepare prayer backup data") }
    }
}

private final class BackupNotificationHandler: NSObject, NotificationHandlerProtocol {
    private let base: NotificationHandlerProtocol?
    init(base: NotificationHandlerProtocol?) { self.base = base; super.init() }
    func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        if notification.request.identifier == PrayerBackupEngine.notificationID { return [.list] }
        return base?.willPresent(notification: notification) ?? []
    }
    func didReceive(response: UNNotificationResponse) { base?.didReceive(response: response) }
}

private struct PrayerBackupHTTPError: LocalizedError {
    let status: Int
    var retryable: Bool { status == 408 || status == 429 || status >= 500 }
    var errorDescription: String? {
        if status == 401 || status == 404 { return "Reconnect Google Drive in backup settings" }
        return "Google Drive could not complete the backup (\(status)). Check connection, permissions and storage."
    }
}

/// Background URLSession owns the upload after preparation, allowing transfers to survive suspension.
final class PrayerBackupEngine: NSObject, URLSessionTaskDelegate, URLSessionDataDelegate {
    static let shared = PrayerBackupEngine()
    static let taskID = "com.wasla.wasla.prayerbackup"
    static let sessionID = "com.wasla.wasla.prayerbackup.upload"
    static let notificationID = "prayer-backup-progress"
    private let defaults = UserDefaults.standard
    private let lock = NSRecursiveLock()
    private let queue = DispatchQueue(label: "wasla.prayer.backup")
    private let prefix = "prayerBackup."
    private var preparing = false
    private var generation = UUID()
    private var backgroundCompletion: (() -> Void)?
    private var preparationTask: UIBackgroundTaskIdentifier = .invalid
    private var bgTask: BGProcessingTask?
    private var lastNotificationProgress = -1
    private lazy var uploadSession: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionID)
        config.sessionSendsLaunchEvents = true; config.isDiscretionary = false
        let delegateQueue = OperationQueue(); delegateQueue.maxConcurrentOperationCount = 1
        return URLSession(configuration: config, delegate: self, delegateQueue: delegateQueue)
    }()
    private var user: String { defaults.string(forKey: prefix + "userId") ?? "" }
    private func config() -> [String: Any] { defaults.dictionary(forKey: prefix + "config." + user) ?? [:] }
    private func saveConfig(_ cfg: [String: Any]) { defaults.set(cfg, forKey: prefix + "config." + user) }
    private func number(_ cfg: [String: Any], _ key: String) -> Double { (cfg[key] as? NSNumber)?.doubleValue ?? 0 }
    private func due(_ cfg: [String: Any]) -> Double { max(number(cfg, "lastSuccess"), number(cfg, "enabledAt")) + number(cfg, "intervalDays") * 86400000 }
    private func setState(_ state: String, error: String = "") { defaults.set(state, forKey: prefix + "state"); defaults.set(error, forKey: prefix + "error") }
    private func keychainQuery() -> [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Self.taskID, kSecAttrAccount as String: "app-token"] }
    private func saveToken(_ token: String?) throws {
        var query = keychainQuery()
        guard let token = token else { SecItemDelete(query as CFDictionary); return }
        let attributes: [String: Any] = [kSecValueData as String: Data(token.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let updated = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw PrayerBackupError.message("Could not securely save backup credentials") }
        query[kSecValueData as String] = Data(token.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else { throw PrayerBackupError.message("Could not securely save backup credentials") }
    }
    private func token() throws -> String {
        lock.lock(); defer { lock.unlock() }
        var query = keychainQuery(); query[kSecReturnData as String] = true
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data, let token = String(data: data, encoding: .utf8) else { throw PrayerBackupError.message("Sign in again to enable backup") }
        return token
    }
    func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.taskID, using: nil) { task in
            guard let task = task as? BGProcessingTask else { task.setTaskCompleted(success: false); return }
            self.lock.lock(); self.bgTask = task; self.lock.unlock()
            task.expirationHandler = {
                self.lock.lock(); defer { self.lock.unlock() }
                // Once handed to URLSession, the upload continues independently of this task.
                if self.preparing && self.defaults.dictionary(forKey: self.prefix + "pending") == nil {
                    self.generation = UUID()
                    self.setState("error", error: "Backup preparation was interrupted. It will retry later.")
                }
                self.finishBG(false); self.schedule(retry: true)
            }
            self.start(manual: false)
        }
        _ = uploadSession
        uploadSession.getAllTasks { tasks in
            self.lock.lock(); defer { self.lock.unlock() }
            if let pending = self.defaults.dictionary(forKey: self.prefix + "pending"), !tasks.contains(where: { $0.taskDescription == pending["id"] as? String }) {
                if let path = pending["zip"] as? String { try? FileManager.default.removeItem(atPath: path) }
                self.defaults.removeObject(forKey: self.prefix + "pending")
                self.setState("error", error: "Backup was interrupted. It will retry later."); self.schedule(retry: true)
            } else if !self.preparing && self.defaults.dictionary(forKey: self.prefix + "pending") == nil {
                self.setState("idle"); self.schedule()
            }
        }
    }
    func attachBackgroundCompletion(_ completion: @escaping () -> Void) {
        lock.lock(); backgroundCompletion = completion; lock.unlock(); _ = uploadSession
    }
    func configure(_ options: [String: Any]) throws {
        lock.lock(); defer { lock.unlock() }
        guard let newUser = options["userId"] as? String, !newUser.isEmpty, let token = options["token"] as? String, !token.isEmpty,
              let api = options["apiBase"] as? String, URL(string: api)?.scheme == "https" else { throw PrayerBackupError.message("Invalid backup settings") }
        let interval = (options["intervalDays"] as? NSNumber)?.intValue ?? 0
        guard [0, 7, 14, 30].contains(interval) else { throw PrayerBackupError.message("Choose 7, 14 or 30 days") }
        let previous = defaults.dictionary(forKey: prefix + "config." + newUser) ?? [:]
        let email = options["email"] as? String ?? "", wifi = options["wifiOnly"] as? Bool ?? true
        let changed = user != newUser || number(previous, "intervalDays") != Double(interval) || previous["email"] as? String != email || (previous["wifiOnly"] as? Bool ?? true) != wifi
        if changed { cancel(); setState("idle") }
        try saveToken(token)
        defaults.set(newUser, forKey: prefix + "userId"); defaults.set(api, forKey: prefix + "apiBase")
        var cfg = previous; cfg["intervalDays"] = interval; cfg["email"] = email; cfg["wifiOnly"] = wifi
        if number(previous, "intervalDays") == 0 && interval > 0 { cfg["enabledAt"] = Date().timeIntervalSince1970 * 1000 }
        cfg["lastSuccess"] = max(number(previous, "lastSuccess"), number(options, "lastSuccess")); saveConfig(cfg)
        schedule()
    }
    func status() -> [String: Any] {
        lock.lock(); defer { lock.unlock() }
        var cfg = config(); cfg["state"] = defaults.string(forKey: prefix + "state") ?? "idle"
        cfg["progress"] = defaults.integer(forKey: prefix + "progress"); cfg["error"] = defaults.string(forKey: prefix + "error") ?? ""
        cfg["nextBackupAt"] = number(cfg, "intervalDays") > 0 ? due(cfg) : 0; return cfg
    }
    private func cancel() {
        generation = UUID()
        let previous = defaults.dictionary(forKey: prefix + "pending")
        uploadSession.getAllTasks { tasks in
            tasks.filter { $0.taskDescription == previous?["id"] as? String }.forEach { $0.cancel() }
            if let path = previous?["zip"] as? String { try? FileManager.default.removeItem(atPath: path) }
        }
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.taskID)
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [Self.notificationID])
        defaults.removeObject(forKey: prefix + "pending")
    }
    func suspend() {
        lock.lock(); defer { lock.unlock() }
        cancel(); defaults.removeObject(forKey: prefix + "userId"); try? saveToken(nil); setState("idle")
    }
    private func schedule(retry: Bool = false) {
        let cfg = config(); guard !user.isEmpty, number(cfg, "intervalDays") > 0 else { return }
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.taskID)
        let request = BGProcessingTaskRequest(identifier: Self.taskID)
        request.requiresNetworkConnectivity = true; request.requiresExternalPower = false
        request.earliestBeginDate = retry ? Date(timeIntervalSinceNow: 15 * 60) : Date(timeIntervalSince1970: due(cfg) / 1000)
        do { try BGTaskScheduler.shared.submit(request) }
        catch { setState("error", error: "Background scheduling is unavailable. Check Background App Refresh in iPhone Settings.") }
    }
    private func finishBG(_ success: Bool) { bgTask?.setTaskCompleted(success: success); bgTask = nil }
    func start(manual: Bool = true) {
        lock.lock(); defer { lock.unlock() }
        guard !user.isEmpty, !preparing, defaults.dictionary(forKey: prefix + "pending") == nil else { finishBG(true); return }
        if !manual && (number(config(), "intervalDays") == 0 || due(config()) > Date().timeIntervalSince1970 * 1000 + 1000) { schedule(); finishBG(true); return }
        preparing = true; setState("queued"); let current = generation, owner = user, cfg = config()
        if manual { DispatchQueue.main.async {
            self.preparationTask = UIApplication.shared.beginBackgroundTask(withName: "Prayer backup") {
                self.lock.lock()
                if self.preparing && self.defaults.dictionary(forKey: self.prefix + "pending") == nil {
                    self.generation = UUID()
                    self.setState("error", error: "Backup preparation was interrupted. Open backup settings to retry.")
                    self.schedule(retry: true)
                }
                self.lock.unlock(); self.endPreparationTime()
            }
        } }
        queue.async { self.prepare(owner: owner, cfg: cfg, generation: current) }
    }
    private func endPreparationTime() {
        DispatchQueue.main.async {
            if self.preparationTask != .invalid { UIApplication.shared.endBackgroundTask(self.preparationTask); self.preparationTask = .invalid }
        }
    }
    private func check(_ current: UUID) throws {
        lock.lock(); defer { lock.unlock() }
        if current != generation { throw PrayerBackupError.message("Backup cancelled") }
    }
    private func progress(_ value: Int, generation: UUID) throws {
        try check(generation); lock.lock(); defer { lock.unlock() }
        defaults.set(value, forKey: prefix + "progress"); setState("running")
        // iOS has no standard notification progress bar; update one silent notification with actual percentages.
        guard value == 0 || value / 5 != lastNotificationProgress / 5 else { return }
        lastNotificationProgress = value
        let content = UNMutableNotificationContent(); content.title = "Backup in progress"
        content.body = value < 45 ? "Preparing prayers and recordings…" : "Backing up to Google Drive · \(value)%"
        content.sound = nil; content.interruptionLevel = .passive; content.threadIdentifier = "wasla.backup"
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: Self.notificationID, content: content, trigger: nil))
    }
    private func prepare(owner: String, cfg: [String: Any], generation current: UUID) {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("PrayerBackups")
        let zip = folder.appendingPathComponent(UUID().uuidString + ".zip")
        var handedOff = false
        defer {
            lock.lock(); preparing = false; lock.unlock(); endPreparationTime()
            if !handedOff { try? FileManager.default.removeItem(at: zip); UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [Self.notificationID]) }
        }
        do {
            try progress(0, generation: current)
            let api = defaults.string(forKey: prefix + "apiBase") ?? ""
            var authURL = URLComponents(string: api + "/backup/drive-token")!
            authURL.queryItems = [URLQueryItem(name: "email", value: cfg["email"] as? String ?? "")]
            let auth = try json(url: authURL.url!, bearer: token(), generation: current)
            guard let access = auth["access_token"] as? String else { throw PrayerBackupError.message("Reconnect Google Drive in backup settings") }
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("my_prays")
            try PrayerBackupArchive.build(root: root, output: zip, userId: owner) { try self.progress($0, generation: current) }
            var driveFolder = try find("name='my-prays-backups' and mimeType='application/vnd.google-apps.folder' and trashed=false", bearer: access, generation: current)
            if driveFolder == nil { driveFolder = try json(url: URL(string: "https://www.googleapis.com/drive/v3/files?fields=id")!, method: "POST", bearer: access, body: ["name": "my-prays-backups", "mimeType": "application/vnd.google-apps.folder"], generation: current) }
            guard let folderID = driveFolder?["id"] as? String else { throw PrayerBackupError.message("Could not create the Drive backup folder") }
            let existing = try find("name='my prays.zip' and '\(folderID)' in parents and trashed=false", bearer: access, generation: current)
            var metadata: [String: Any] = ["name": "my prays.zip"]
            if existing == nil { metadata["parents"] = [folderID] }
            let suffix = (existing?["id"] as? String).map { "/" + $0 } ?? ""
            var request = URLRequest(url: URL(string: "https://www.googleapis.com/upload/drive/v3/files\(suffix)?uploadType=resumable")!)
            request.httpMethod = existing == nil ? "POST" : "PATCH"; request.setValue("Bearer " + access, forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.setValue("application/zip", forHTTPHeaderField: "X-Upload-Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: metadata)
            let (_, response) = try send(request, generation: current)
            guard let location = response.value(forHTTPHeaderField: "Location"), let url = URL(string: location), url.scheme == "https", url.host?.hasSuffix(".googleapis.com") == true else { throw PrayerBackupError.message("Invalid Google Drive upload URL") }
            try progress(45, generation: current)
            lock.lock(); defer { lock.unlock() }; try check(current)
            var upload = URLRequest(url: url); upload.httpMethod = "PUT"; upload.setValue("application/zip", forHTTPHeaderField: "Content-Type")
            upload.allowsCellularAccess = !(cfg["wifiOnly"] as? Bool ?? true)
            let task = uploadSession.uploadTask(with: upload, fromFile: zip)
            let description = UUID().uuidString; task.taskDescription = description
            defaults.set(["id": description, "userId": owner, "zip": zip.path, "generation": current.uuidString], forKey: prefix + "pending")
            task.resume(); handedOff = true; finishBG(true)
        } catch {
            lock.lock(); defer { lock.unlock() }
            if generation == current {
                setState("error", error: error.localizedDescription)
                // Invalid credentials, empty data and storage errors need attention, not repeated notifications.
                if error is URLError || (error as? PrayerBackupHTTPError)?.retryable == true { schedule(retry: true) }
            }
            finishBG(false)
        }
    }
    private func find(_ query: String, bearer: String, generation: UUID) throws -> [String: Any]? {
        var parts = URLComponents(string: "https://www.googleapis.com/drive/v3/files")!
        parts.queryItems = [URLQueryItem(name: "q", value: query), URLQueryItem(name: "fields", value: "files(id)"), URLQueryItem(name: "orderBy", value: "modifiedTime desc")]
        return (try json(url: parts.url!, bearer: bearer, generation: generation)["files"] as? [[String: Any]])?.first
    }
    private func json(url: URL, method: String = "GET", bearer: String, body: [String: Any]? = nil, generation: UUID) throws -> [String: Any] {
        var request = URLRequest(url: url); request.httpMethod = method; request.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization")
        if let body = body { request.httpBody = try JSONSerialization.data(withJSONObject: body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, _) = try send(request, generation: generation)
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw PrayerBackupError.message("Unexpected Drive response") }; return value
    }
    private func send(_ request: URLRequest, generation: UUID) throws -> (Data, HTTPURLResponse) {
        try check(generation)
        let semaphore = DispatchSemaphore(value: 0)
        let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForRequest = 45; config.timeoutIntervalForResource = 60
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        var result: (Data?, URLResponse?, Error?) = (nil, nil, nil)
        let task = session.dataTask(with: request) { data, response, error in result = (data, response, error); semaphore.signal() }
        task.resume()
        guard semaphore.wait(timeout: .now() + 65) == .success else { task.cancel(); session.invalidateAndCancel(); throw PrayerBackupError.message("Backup connection timed out. It will retry later.") }
        session.finishTasksAndInvalidate(); try check(generation)
        if let error = result.2 { throw error }
        guard let response = result.1 as? HTTPURLResponse else { throw PrayerBackupError.message("Could not connect to Google Drive") }
        guard (200..<300).contains(response.statusCode) else { throw PrayerBackupHTTPError(status: response.statusCode) }
        return (result.0 ?? Data(), response)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        lock.lock(); defer { lock.unlock() }
        guard session.configuration.identifier == Self.sessionID, let pending = defaults.dictionary(forKey: prefix + "pending"), pending["id"] as? String == task.taskDescription, totalBytesExpectedToSend > 0 else { return }
        try? progress(45 + Int(54 * totalBytesSent / totalBytesExpectedToSend), generation: generation)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard session.configuration.identifier == Self.sessionID else { return }
        lock.lock(); defer { lock.unlock() }
        guard let pending = defaults.dictionary(forKey: prefix + "pending"), pending["id"] as? String == task.taskDescription else { return }
        defaults.removeObject(forKey: prefix + "pending")
        if let path = pending["zip"] as? String { try? FileManager.default.removeItem(atPath: path) }
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [Self.notificationID])
        guard pending["userId"] as? String == user else { return }
        if error == nil, let response = task.response as? HTTPURLResponse, (200..<300).contains(response.statusCode) {
            var cfg = config(); cfg["lastSuccess"] = Date().timeIntervalSince1970 * 1000; saveConfig(cfg)
            defaults.set(100, forKey: prefix + "progress"); setState("complete"); schedule()
        } else {
            let status = (task.response as? HTTPURLResponse)?.statusCode
            setState("error", error: "Backup did not finish. Check your connection and Google Drive account.")
            if error != nil || status.map({ PrayerBackupHTTPError(status: $0).retryable }) == true { schedule(retry: true) }
        }
    }
    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        lock.lock(); let completion = backgroundCompletion; backgroundCompletion = nil; lock.unlock()
        DispatchQueue.main.async { completion?() }
    }
}
