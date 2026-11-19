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
        let logo = UIView()
        logo.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(logo)
        NSLayoutConstraint.activate([
            logo.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
            logo.centerYAnchor.constraint(equalTo: cover.centerYAnchor),
            logo.widthAnchor.constraint(equalToConstant: 190),
            logo.heightAnchor.constraint(equalToConstant: 130)
        ])
        let atlas = UIImage(named: "LaunchLetters")?.cgImage
        let start = CACurrentMediaTime()
        for index in 0..<6 {
            let layer = CALayer()
            layer.frame = CGRect(x: 0, y: 0, width: 190, height: 130)
            layer.contents = atlas
            layer.contentsRect = CGRect(x: CGFloat(index)/6, y: 0, width: 1.0/6, height: 1)
            logo.layer.addSublayer(layer)
            guard index > 0, !UIAccessibility.isReduceMotionEnabled else { continue }
            layer.opacity = 0
            let pulse = CAKeyframeAnimation(keyPath: "opacity")
            pulse.keyTimes = [0, 0.01, 0.014, 0.024, 0.036, 0.054, 0.059, 0.07, 0.12, 1]
            pulse.values = [0, 0, 0.92, 0.52, 0, 0, 1, 0.86, 0, 0]
            pulse.duration = 3.6
            pulse.beginTime = start + Double(index - 1) * 0.6
            pulse.repeatCount = .infinity
            layer.add(pulse, forKey: "launchPulse")
        }
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
