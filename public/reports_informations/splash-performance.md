# Splash performance and cold startup

Reviewed 20 November 2026. On a normal signed-in launch, Wasla keeps a fixed native logo visible until the Pray editor is ready to appear. The Galaxy A24 took about 2.6 seconds to reach that screen. The active launch path has no fixed two-second delay.

## From the app icon to Pray

| Stage | What happens |
| --- | --- |
| Android launch | Android displays the launch theme. `MainActivity` starts Capacitor and places a native logo view over the WebView. The installed Galaxy A24 resolved the launcher intent directly to `MainActivity`. [Manifest](../../android/app/src/main/AndroidManifest.xml) · [MainActivity](../../android/app/src/main/java/com/worship/app/MainActivity.java) · [Logo view](../../android/app/src/main/java/com/worship/app/LaunchCover.java) |
| iOS launch | iOS displays the launch storyboard. The Swift bridge controller then places a matching native view over the web content. This path was verified from source. Physical-device timings below are Android only. [Storyboard](../../ios/App/App/Base.lproj/LaunchScreen.storyboard) · [Bridge controller](../../ios/App/App/PrayerBridgeViewController.swift) |
| Web screen ready | For a signed-in user with a cached username, the handoff looks for the header logo and the real textarea in the active Pray panel. A rendered error alert can also release the cover. After two animation frames it checks again and calls `WaslaLaunch.ready()`. [Handoff](../../src/app/hooks/useNativeLaunchHandoff.js) |
| Cover removed | Android waits for the WebView visual-state callback and removes the logo. iOS removes its cover on the main thread. This lets the user go directly from the logo to the first screen. [Android callback](../../android/app/src/main/java/com/worship/app/LaunchScreenPlugin.java) · [iOS callback](../../ios/App/App/PrayerBridgeViewController.swift) |

## Timers and exceptions

- **2.05 seconds** belongs to the old Android `SplashActivity`. Launching the installed app from its icon bypasses that activity. [Legacy timer](../../android/app/src/main/java/com/worship/app/SplashActivity.java)
- **10 seconds** is the recovery deadline on each native platform if the web handoff fails. JavaScript also releases deferred work after its own recovery deadline. On a successful launch, the ready signal releases the cover and deferred work earlier. [Android cover](../../android/app/src/main/java/com/worship/app/MainActivity.java) · [iOS cover](../../ios/App/App/PrayerBridgeViewController.swift) · [JavaScript recovery](../../src/app/utils/nativeLaunch.js)
- **Missing cached username.** A signed-in user whose username is missing locally can wait for the profile lookup before the app signals readiness. This can make an individual launch sensitive to network latency. [Authentication gate](../../src/app/components/AppAuthGatekeeper.jsx)
- **After an eligible update**, the web layer can show a separate release intro with a 600 ms hold after the logo animation and a 600 ms fade. First installation establishes the version baseline. Ordinary launches of the same version skip this intro. [Release intro](../../src/app/components/WaslaSplashIntro.jsx)

## Galaxy A24 measurements

Each visual comparison used three process cold starts per build on the same phone. The interval runs from the first visible launcher transition to the first recorded frame matching the Pray editor card.

| Build | Three recorded times | Median |
| --- | --- | --- |
| Installed 2.0.5 | 2.610 s, 2.556 s, 2.635 s | 2.610 s |
| Final build with deferred prayer history | 2.592 s, 2.528 s, 2.560 s | 2.560 s |

The median moved by **50 ms**. The ranges overlap, so these runs do not establish a repeatable speedup. Earlier, separate Android traces placed the start of local web-app loading at **1.16–1.21 s** after launch and the ready call at **2.45–2.47 s**. Roughly half the elapsed time passed before web loading began. The remainder included bringing up the web app and rendering the editor. The traces do not isolate the cost of individual plugins or components.

## Behavior to preserve

The editor can accept input while the saved-card area shows placeholders. The first local snapshot replaces them with cards or the empty state. Typing, focus and the draft survive this transition. Warm returns reuse the cached history. Ordinary history processing, repairs and inbox/profile refreshes can follow the handoff. An explicit notification can still request its target immediately. [Pray page guide](../../src/app/pray/README.md) · [Slow-storage regression test](../../tests/prayer-session.browser.cjs)

Billing configuration, backup configuration and push registration also wait for the handoff. Notification-open handling stays available early. When investigating a future slowdown, compare the start of web loading, the ready call and the first visible editor frame separately. A launch approaching ten seconds warrants checking whether the ready call reached native code. [Billing](../../src/app/components/BillingLifecycle.jsx) · [Backup](../../src/app/components/PrayerBackupLifecycle.jsx) · [Push notifications](../../src/app/services/pushNotificationService.js)
