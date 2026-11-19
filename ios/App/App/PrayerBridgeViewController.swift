import Capacitor
import FirebaseMessaging
import UIKit
import UserNotifications

final class PrayerBridgeViewController: CAPBridgeViewController {
    private var launchCover: UIView?

    override func viewDidLoad() {
        super.viewDidLoad()
        let cover = UIView(frame: view.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.backgroundColor = UIColor(red: 9/255, green: 13/255, blue: 25/255, alpha: 1)
        let logo = UIImageView(image: UIImage(named: "LaunchLogo"))
        logo.contentMode = .scaleAspectFit
        logo.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(logo)
        NSLayoutConstraint.activate([
            logo.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
            logo.centerYAnchor.constraint(equalTo: cover.centerYAnchor),
            logo.widthAnchor.constraint(equalToConstant: 288),
            logo.heightAnchor.constraint(equalToConstant: 288)
        ])
        view.addSubview(cover)
        launchCover = cover
        // Allow recovery when an older bundle cannot send the ready signal.
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in self?.dismissLaunchCover() }
    }

    fileprivate func dismissLaunchCover() {
        launchCover?.removeFromSuperview()
        launchCover = nil
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(LaunchScreenPlugin())
        bridge?.registerPluginInstance(PrayerNotificationsPlugin())
        bridge?.registerPluginInstance(PrayerBackupPlugin())
        bridge?.registerPluginInstance(PrayerStoragePlugin())
    }
}

@objc(LaunchScreenPlugin)
final class LaunchScreenPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "LaunchScreenPlugin"
    let jsName = "WaslaLaunch"
    let pluginMethods = [CAPPluginMethod(name: "ready", returnType: CAPPluginReturnPromise)]

    @objc func ready(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            (self.bridge?.viewController as? PrayerBridgeViewController)?.dismissLaunchCover()
            call.resolve()
        }
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
