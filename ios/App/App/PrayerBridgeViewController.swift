import Capacitor
import FirebaseMessaging
import UIKit
import UserNotifications

final class PrayerBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(PrayerNotificationsPlugin())
    }
}

@objc(PrayerNotificationsPlugin)
final class PrayerNotificationsPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "PrayerNotificationsPlugin"
    let jsName = "PrayerNotifications"
    let pluginMethods = [CAPPluginMethod(name: "getFcmToken", returnType: CAPPluginReturnPromise)]
    private var handler: PrayerForegroundHandler?

    override func load() {
        // Preserve Capacitor's event/tap routing while suppressing foreground banners.
        _ = bridge?.plugin(withName: "PushNotifications")
        guard let router = bridge?.notificationRouter else { return }
        let handler = PrayerForegroundHandler(base: router.pushNotificationHandler)
        self.handler = handler
        router.pushNotificationHandler = handler
    }

    @objc func getFcmToken(_ call: CAPPluginCall) {
        guard Messaging.messaging().apnsToken != nil else {
            call.reject("APNs registration is not ready yet")
            return
        }
        Messaging.messaging().token { token, error in
            if let token = token { call.resolve(["token": token]) }
            else { call.reject(error?.localizedDescription ?? "FCM registration failed") }
        }
    }
}

private final class PrayerForegroundHandler: NSObject, NotificationHandlerProtocol {
    private let base: NotificationHandlerProtocol?
    init(base: NotificationHandlerProtocol?) { self.base = base; super.init() }

    func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        let options = base?.willPresent(notification: notification) ?? []
        return UIApplication.shared.applicationState == .active ? [] : options
    }

    func didReceive(response: UNNotificationResponse) {
        base?.didReceive(response: response)
    }
}
