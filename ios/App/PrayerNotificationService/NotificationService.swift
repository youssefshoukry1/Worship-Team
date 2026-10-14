import UserNotifications
import Intents
import UIKit
import ImageIO
import CryptoKit

final class NotificationService: UNNotificationServiceExtension, URLSessionDataDelegate {
    private let limit = 5 * 1024 * 1024
    private let completionLock = NSLock()
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var original: UNMutableNotificationContent?
    private var bestAttempt: UNNotificationContent?
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var bytes = Data()
    private var anonymous = false
    private var senderName = "A friend"
    private var conversationID = ""
    private var avatarURL: URL?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            finish(request.content); return
        }
        original = content
        bestAttempt = content
        let info = content.userInfo
        guard let type = info["type"] as? String, ["PRAY_SHARED", "PRAY_CONFIRMED"].contains(type) else {
            finish(content); return
        }
        anonymous = type == "PRAY_SHARED" && (info["isAnonymous"] as? String == "true" || info["isAnonymous"] as? Bool == true)
        let name = (info["title"] as? String ?? content.title).trimmingCharacters(in: .whitespacesAndNewlines)
        senderName = anonymous ? "anonymously user" : (name.isEmpty ? "A friend" : name)
        content.title = senderName
        content.userInfo["title"] = senderName
        content.userInfo["url"] = "/pray"
        if anonymous { content.userInfo["avatarUrl"] = "" }
        conversationID = "prayer-\(type)-\(info["shareId"] as? String ?? request.identifier)"
        content.threadIdentifier = conversationID

        let fallback = fallbackAvatar()
        // Keep an avatar-ready fallback available if iOS ends the extension's time budget.
        bestAttempt = (try? content.updating(from: messageIntent(image: fallback))) ?? content
        guard !anonymous, let value = info["avatarUrl"] as? String,
              let url = URL(string: value), url.scheme?.lowercased() == "https" else {
            deliver(image: fallback); return
        }
        avatarURL = url
        if let image = cachedAvatar(url: url) { deliver(image: image); return }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 8
        configuration.timeoutIntervalForResource = 12
        let queue = OperationQueue(); queue.maxConcurrentOperationCount = 1
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
        self.session = session
        var urlRequest = URLRequest(url: url)
        urlRequest.setValue("image/*", forHTTPHeaderField: "Accept")
        let task = session.dataTask(with: urlRequest)
        self.task = task
        task.resume()
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let response = response as? HTTPURLResponse, response.statusCode == 200,
              response.expectedContentLength <= Int64(limit) else {
            completionHandler(.cancel); return
        }
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(request.url?.scheme?.lowercased() == "https" ? request : nil)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard bytes.count + data.count <= limit else { dataTask.cancel(); return }
        bytes.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if error == nil, let image = thumbnail(bytes) {
            if let url = avatarURL { cacheAvatar(image, url: url) }
            deliver(image: image)
        } else {
            deliver(image: fallbackAvatar())
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let content = bestAttempt { finish(content) }
    }

    private func deliver(image: UIImage) {
        guard let content = original else { return }
        let intent = messageIntent(image: image)
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate { [weak self] _ in
            guard let self = self else { return }
            let updated = (try? content.updating(from: intent)) ?? content
            self.finish(updated)
        }
    }

    private func messageIntent(image: UIImage) -> INSendMessageIntent {
        let sender = INPerson(personHandle: INPersonHandle(value: conversationID, type: .unknown),
                              nameComponents: nil, displayName: senderName,
                              image: image.pngData().map { INImage(imageData: $0) },
                              contactIdentifier: nil, customIdentifier: conversationID)
        return INSendMessageIntent(recipients: nil, outgoingMessageType: .outgoingMessageText,
                                   content: original?.body, speakableGroupName: nil,
                                   conversationIdentifier: conversationID, serviceName: "Wasla",
                                   sender: sender, attachments: nil)
    }

    private func finish(_ content: UNNotificationContent) {
        completionLock.lock()
        let handler = contentHandler
        contentHandler = nil
        completionLock.unlock()
        guard let handler = handler else { return }
        task?.cancel()
        session?.invalidateAndCancel()
        handler(content)
    }

    private func fallbackAvatar() -> UIImage {
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: 256, height: 256), format: format).image { _ in
            let circle = UIBezierPath(ovalIn: CGRect(x: 0, y: 0, width: 256, height: 256))
            circle.addClip(); UIColor(red: 16/255, green: 47/255, blue: 66/255, alpha: 1).setFill(); circle.fill()
            if anonymous {
                UIImage(systemName: "eye.slash", withConfiguration: UIImage.SymbolConfiguration(pointSize: 110, weight: .medium))?
                    .withTintColor(.white, renderingMode: .alwaysOriginal)
                    .draw(in: CGRect(x: 48, y: 62, width: 160, height: 132))
            } else {
                let name = senderName.drop(while: { $0 == "@" })
                let initial = name.first.map { String($0).uppercased() } ?? "?"
                let attributes: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 112, weight: .semibold), .foregroundColor: UIColor.white]
                let size = (initial as NSString).size(withAttributes: attributes)
                (initial as NSString).draw(at: CGPoint(x: (256-size.width)/2, y: (256-size.height)/2), withAttributes: attributes)
            }
        }
    }

    private func thumbnail(_ data: Data) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 256
              ] as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }

    private func cacheFile(url: URL) -> URL? {
        guard let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        let folder = directory.appendingPathComponent("notification-avatars", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let key = SHA256.hash(data: Data(url.absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()
        return folder.appendingPathComponent(key + ".png")
    }

    private func cachedAvatar(url: URL) -> UIImage? {
        guard let file = cacheFile(url: url), let data = try? Data(contentsOf: file) else { return nil }
        return thumbnail(data)
    }

    private func cacheAvatar(_ image: UIImage, url: URL) {
        guard let file = cacheFile(url: url), let data = image.pngData() else { return }
        try? data.write(to: file, options: .atomic)
        guard let files = try? FileManager.default.contentsOfDirectory(at: file.deletingLastPathComponent(),
                        includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let sorted = files.sorted {
            let first = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date.distantPast
            let second = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date.distantPast
            return first < second
        }
        for old in sorted.prefix(max(0, sorted.count - 32)) { try? FileManager.default.removeItem(at: old) }
    }
}
