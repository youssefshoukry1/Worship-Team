# Splash performance and cold startup

Updated 20 November 2026. On a returning signed-in phone launch, Wasla can reveal the public Pray layout before React attaches the editor. In the latest Galaxy A24 comparison, the median time to remove the native cover was 1.09 seconds. See the final section for the test conditions.

## From the app icon to Pray

| Stage | What happens |
| --- | --- |
| Android launch | Android displays the launch theme. `MainActivity` starts Capacitor and places a native logo view over the WebView. The installed Galaxy A24 resolved the launcher intent directly to `MainActivity`. [Manifest](../../android/app/src/main/AndroidManifest.xml) · [MainActivity](../../android/app/src/main/java/com/worship/app/MainActivity.java) · [Logo view](../../android/app/src/main/java/com/worship/app/LaunchCover.java) |
| iOS launch | iOS displays the launch storyboard. The Swift bridge controller then places a matching native view over the web content. This path was verified from source. Physical-device timings below are Android only. [Storyboard](../../ios/App/App/Base.lproj/LaunchScreen.storyboard) · [Bridge controller](../../ios/App/App/PrayerBridgeViewController.swift) |
| Web screen ready | On phone-width native Pray entry, a cached token and username enable an early handoff from the exported HTML. The live editor replaces the public view once the header and composer have mounted. Other routes, larger layouts, and missing native bridge support use the regular handoff. [Preview](../../src/app/utils/startPrayerPreview.js) ? [Handoff](../../src/app/hooks/useNativeLaunchHandoff.js) |
| Cover removed | Android waits for the WebView visual-state callback and removes the logo. iOS removes its cover on the main thread. This lets the user go directly from the logo to the first screen. [Android callback](../../android/app/src/main/java/com/worship/app/LaunchScreenPlugin.java) · [iOS callback](../../ios/App/App/PrayerBridgeViewController.swift) |

## Timers and exceptions

- **2.05 seconds** belongs to the old Android `SplashActivity`. Launching the installed app from its icon bypasses that activity. [Legacy timer](../../android/app/src/main/java/com/worship/app/SplashActivity.java)
- **10 seconds** is the recovery deadline on each native platform if the web handoff fails. JavaScript also releases deferred work after its own recovery deadline. On a successful launch, the ready signal releases the cover and deferred work earlier. [Android cover](../../android/app/src/main/java/com/worship/app/MainActivity.java) · [iOS cover](../../ios/App/App/PrayerBridgeViewController.swift) · [JavaScript recovery](../../src/app/utils/nativeLaunch.js)
- **Missing cached username.** A signed-in user whose username is missing locally sees an account-recovery screen. Its first paint can release the native cover while the request is pending. A lookup times out after eight seconds. The user can retry, reconnect, or sign out. A confirmed account with no username opens the claim form. [Recovery screen](../../src/app/components/UsernameRecovery.jsx)
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

## Cold-start investigation and implementation plan

### Findings before implementation

The user-visible target is the time from tapping Wasla to seeing the correct screen and being able to type the first character. Android can report a first frame while the native logo still covers the WebView. Apple also distinguishes drawing the first frame from being ready for interaction. Record both events. [Android startup metrics](https://developer.android.com/topic/performance/vitals/launch-time) · [Apple launch metrics](https://developer.apple.com/documentation/xcode/reducing-your-app-s-launch-time)

- **Typical signed-in launch.** In the saved A24 traces, Capacitor logged “Loading app” around 1.2 seconds and received the ready call around 2.46 seconds. That log is inside bridge setup, before the call that loads the URL. It gives a useful dividing point but cannot assign 1.2 seconds to WebView alone. Android inflates its WebView and registers Capacitor plugins on the way to that point. The merged debug manifest also includes Firebase and AndroidX initializers, including WorkManager. Their individual costs require a trace.
- **Slow account recovery.** A token with a missing cached username causes the auth gate to wait for the profile lookup. The request sets no timeout at this call site. In a controlled Chromium run with a simulated Android bridge and a 2.5-second profile delay, the ready signal arrived at 342 ms with the username cached and 3,038 ms with it missing. One run per condition establishes that the request can hold the splash. It does not establish how often users encounter this state. [Auth gate](../../src/app/components/AppAuthGatekeeper.jsx)
- **Web startup on the current local export.** With a cached username and backend requests stalled, desktop Chrome found the enabled Pray editor at a median 491 ms, or 1,210 ms at 4× CPU throttling, over three runs per condition. The public layout was present at 65 and 191 ms respectively. These are web-document measurements. The inert layout cannot receive a keystroke. The existing benchmark's `main textarea` selector timed out because the touch pager places the editor outside that wrapper. The rerun used the active panel's real Pray textarea in memory. The entry HTML references 1,295,843 bytes of JavaScript before compression. That figure describes assets, not time spent executing them. [Benchmark](../../scripts/measure-startup.cjs) · [Startup layout](../../src/app/components/AppStartupShell.jsx)
- **iOS.** The static storyboard hands off to a native cover above WKWebView. The app delegate configures Firebase and registers background backup. That backup method also creates a background URL session and starts an asynchronous task lookup. The source confirms these operations exist. It does not establish which takes meaningful time. The delivered-notification cleanup also runs at activation. An iPhone Instruments trace is needed before changing their order. [App delegate](../../ios/App/App/AppDelegate.swift) · [Backup engine](../../ios/App/App/PrayerBackupPlugin.swift)
- **Updates and exceptional launches.** The normal logo, optional post-update intro, OTA rollback acknowledgement, and ten-second recovery deadline have separate jobs. Built-in and OTA bundles should be timed separately. The native watchdog starts when the cover is installed, so it does not bound total time from tapping the icon. The JavaScript recovery timer releases waiting services. [Release intro](../../src/app/components/WaslaSplashIntro.jsx) · [Updater](../../src/app/CapgoUpdater.jsx) · [Handoff](../../src/app/hooks/useNativeLaunchHandoff.js)

### Implementation plan and acceptance criteria

| Step | Change or experiment | Risk and verification |
| --- | --- | --- |
| 1. Establish a device baseline | Fix the benchmark selector. In a release-equivalent build, mark launcher start, Activity or AppDelegate entry, Capacitor bridge and WebView initialization, web navigation start, first active editor commit, ready call, and native cover removal. Film a first tap and verify the character survives. On Android use Perfetto, Macrobenchmark and a fully-drawn signal for the usable screen. On iOS use App Launch Instruments and signposts. | Low risk. Collect at least 20 interleaved cold runs per build and compare median and P90 on the same device. Report first install, returning signed-in cold start, warm resume and first launch after an update separately. Existing A24 recordings cover returning cold starts. |
| 2. Fix the confirmed network-dependent wait | For a missing cached username, reveal an account-recovery screen as soon as it is painted. Give the profile lookup a bounded wait and an offline retry. Continue to Pray only after the account is resolved. | Web/OTA change. Keep the signed-in, signed-out and new-username states distinct. Test slow, failed and expired sessions, account switching and a response arriving after logout. No private journal should appear on the recovery screen. This targets unusually long starts. |
| 3. Reduce ordinary cold-start work | Trace JavaScript evaluation and the initial Pray chunk. First try loading the release animation on demand and moving optional OTA release discovery after the first usable frame. Keep the early bundle-health acknowledgement and notification-open listener. Leave page navigation and journal pagination in place. On Android trace notification enumeration and cancellation in MainActivity.onResume with zero and many notifications. Also time WorkManager initialization. Change only a measured contributor per trial. | Web changes can ship OTA. Android changes need a native build. Test offline startup, notification taps, scheduled backups, purchases, OTA rollback and clicking the first control immediately. If WorkManager is material, use its supported on-demand initialization and verify background-only starts. [Android WorkManager guidance](https://developer.android.com/develop/background-work/background-tasks/persistent/configuration/custom-configuration) |
| 4. Test platform-specific options | If Android traces show WebView startup dominates, test early asynchronous initialization in an isolated build. Wasla declares AndroidX WebKit 1.14.0. Verify the resolved release dependency before trying the current supported API. Capacitor needs a WebView immediately, which limits overlap. On iOS, measure Firebase, WKWebView creation, and backup session recovery separately. Defer measured optional foreground work while preserving background session restoration and launch-time registration of task handlers. | Native Android or iOS build. An immediate WebView access can consume the entire warm-up benefit. Delaying iOS registrations can break background launches. Validate on an older supported phone and a real iPhone. [Android WebView startup guidance](https://developer.android.com/develop/ui/views/layout/webapps/optimize-webview-startup) · [Apple background task registration](https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler/register%28fortaskwithidentifier%3Ausing%3Alaunchhandler%3A%29) |
| 5. Decide whether an earlier visual handoff helps | Consider this only if a material delay remains. Prototype revealing the actual editor at its earliest safe paint. The current HTML shell still shows a Hymns tab and a labeled recording button and is inert. Exposing it as-is would reproduce the UI change and lost-first-tap risk. Keep Android's visual-state check and film both platforms frame by frame. | Higher UX risk. Accept only if the first usable keystroke arrives earlier, no blank or duplicate screen appears, and the median improves beyond run-to-run variation without a slower P90 or worse warm navigation. [Android visual-state callback](https://developer.android.com/reference/android/webkit/WebView.VisualStateCallback) |

A practical first milestone is a repeatable reduction of 250 ms or more from a freshly measured A24 cold-start median. This is a proposed target, not a forecast. The current review used the saved phone traces and fresh browser experiments. ADB reported the A24 as unauthorized during this review, and there is no physical iPhone timing.

## Implemented changes and verification

On returning signed-in touch launches, the pager starts the local Pray component import during hydration. If it has resolved when the panel mounts, React can render the editor on its first attempt. The panel keeps its component type for that mount, preserving focus and draft state. The sign-in form stays available synchronously for logout. Username setup and the optional release animation load when needed. Native OTA health acknowledgement and notification-open listeners start early. Optional release discovery waits for the native screen handoff. [Pager](../../src/app/components/PrimaryTabPager.jsx) · [Release intro](../../src/app/components/WaslaSplashIntro.jsx) · [Updater](../../src/app/CapgoUpdater.jsx)

Account recovery can release the cover as soon as its own screen paints. The lookup is cancellable and tied to the active account. An expired session offers sign-in, and a successful response identifying an account without a username opens setup. The real Pray editor remains the handoff condition for a returning user with a cached username. [Recovery](../../src/app/components/UsernameRecovery.jsx) · [Recovery tests](../../tests/startup-recovery.browser.cjs)

### Browser comparison

The before and after runs used production exports, a fresh mobile-sized Chrome context per trial, a cached test username, and stalled backend requests. Twenty trials per build at each CPU setting alternated in before/after/after/before order. Timing starts at web document navigation and ends at the first sampled rendering opportunity with the active Pray textarea enabled. P90 describes the 90th percentile.

| Desktop Chrome | Previous median | Updated median | Previous P90 | Updated P90 |
| --- | ---: | ---: | ---: | ---: |
| Normal CPU | 506 ms | 198 ms | 523 ms | 206 ms |
| 4× CPU slowdown | 1,216 ms | 944 ms | 1,276 ms | 995 ms |

These results apply to the complete frontend change. They do not include native process startup. Six recovery browser checks and 80 related regression tests passed, covering recovery, retry, sign-out, swipe navigation, saved prayers, billing and OTA behavior. The benchmark now samples the active pager panel. [Benchmark](../../scripts/measure-startup.cjs)

### Native measurement and release

Android emits trace sections for bridge activity creation and clearing delivered notifications, and calls `reportFullyDrawn()` when the successful WebView visual callback removes the cover. iOS adds Instruments signposts around Firebase setup, backup registration, bridge construction and waiting for the web screen. JavaScript records `wasla-launch-screen-ready` just before invoking the bridge. An Android test APK compiled. The Galaxy A24 comparison below is complete. A physical iPhone measurement and an iOS build are outstanding.

The frontend optimizations can ship by OTA to compatible installed shells. Native timing instrumentation ships with the next native binaries. Revisit WebView warm-up or native initializer deferral only after attributing time on devices. The fixed launch logo and render-ready checks continue to cover the transition to the actual screen.

### Galaxy A24 cold starts after implementation

Tested on a Samsung Galaxy A24 running Android 16. Both isolated debug APKs used production web exports, synthetic cached sign-in, an empty test journal, and unavailable backend services. Push registration was disabled in both test packages. The production Wasla installation was separate. After a warm-up for each build, 20 paired process cold starts alternated launch order. One interrupted launch paused before the handoff and was repeated. These figures describe returning signed-in launches from a stopped process. First installation, OTA activation, and warm resume have different costs.

| Elapsed time on the A24 | Previous median | Updated median | Previous P90 | Updated P90 |
| --- | ---: | ---: | ---: | ---: |
| Launch command to native cover removal | 2,730 ms | 2,439 ms | 3,031 ms | 2,554 ms |
| Launch command to Capacitor's local loading marker | 1,236 ms | 1,203 ms | 1,325 ms | 1,264 ms |
| Local loading marker to native cover removal | 1,480 ms | 1,226 ms | 1,746 ms | 1,347 ms |

The updated build reached the handoff **291 ms earlier at the median** and **477 ms earlier at P90**. It was faster in all 20 matched pairs. Most of the median improvement occurred after the local loading marker. Each row summarizes its own samples, so component medians need not add up to the total. Android timestamps were collected on the device from just before issuing the launch command to the WebView visual callback removing the cover.

A separate screen recording per build measured from the first visible launcher transition to the first frame matching the Pray card. It showed **2.444 s before** and **2.175 s after**. These recordings use visual endpoints and do not contribute to the 20-run statistics.

In input spot checks, one automated tap immediately followed by a keystroke failed verification on the updated build. Two immediate reruns retained the character. Three additional cold starts that checked editor focus before issuing the keystroke also passed. The cause of the single miss is unresolved.

### Android release trace on the Galaxy A24

On 20 November 2026, an isolated, non-debuggable, shell-profileable release APK used the production web export, a synthetic cached account, an empty journal, and disabled push registration. It ran with the built-in web bundle on Android 16 and Android System WebView 157.0.8103.38. After one warm-up, the test force-stopped only its own package before each of nine launches. Perfetto identified all nine as cold and captured both the local loading marker and the successful native visual callback in every trace. A screenshot after the final run confirmed the Pray editor was visible. Input latency was outside this measurement.

| Interval | Median | Observed range |
| --- | ---: | ---: |
| Android launch start to entry into Capacitor's activity creation | 197 ms | 180–216 ms |
| Inflate the layout containing the first WebView | 171 ms | 161–199 ms |
| Register all enabled Capacitor plugins | 28 ms | 26–34 ms |
| Android launch start to Capacitor's local loading marker | 416 ms | 397–471 ms |
| Local loading marker to removal of the native cover | 904 ms | 878–964 ms |
| Android launch start to removal of the native cover | 1,330 ms | 1,275–1,409 ms |

The rows overlap. Within WebView creation, Chromium initialization took a median 115 ms. Within plugin registration, the OTA updater's load hook took 20 ms. WorkManager initialization took 8 ms during application startup. Clearing delivered notifications during resume took less than 1 ms with an empty tray. These measurements favor keeping backup and OTA initialization in their current order. Push-enabled production startup, a full notification tray, and iOS require separate measurements.

The earlier debug benchmark started its clock before the shell launch command. This release trace starts at Android's launch event, uses a different build type, and was collected in a separate session. The difference between their totals cannot be attributed to a code change. To investigate the largest remaining interval, trace local document navigation, JavaScript execution, the active editor commit, the ready call, and the WebView visual callback together in the same release build. The 904 ms includes WebView loading and display work as well as the frontend.

### From local navigation to the visible Pray editor

Nine additional process cold starts used the same A24 release fixture. Test-only markers recorded the first inline script, React's `hydrateRoot` call, attachment of the enabled textarea in the active Pray panel, the JavaScript ready call, and native cover removal. Five WebView clock samples taken after each handoff aligned browser and native time. The fastest round trip in each launch ranged from 1.0 to 4.1 ms.

| Consecutive interval | Median |
| --- | ---: |
| Capacitor's local loading marker to document navigation start | 3 ms |
| Navigation start to the first inline script | 233 ms |
| First inline script to the start of React hydration | 189 ms |
| Start of hydration to attachment of the active editor | 198 ms |
| Editor attachment to JavaScript signaling ready | 81 ms |
| JavaScript ready signal to native cover removal | 202 ms |

The full interval had a median of **910 ms** and ranged from 893 to 1,015 ms. Each row has its own median. The local HTML response finished 149 ms after navigation began. By the time hydration began, WebView had completed 21 local JavaScript resource loads. The hydration interval includes scheduling and rendering the first screen. These timings do not isolate CPU cost per script.

During the final 202 ms, the Android UI thread spent a median **160 ms** inside frame-drawing `postAndWait` calls. This identifies overlap with rendering, without assigning the wait to a particular effect or view. A focused next experiment is to move one optional dependency out of the initial Pray bundle and compare editor attachment and visible Pray together. Keep the enabled-editor and native visual checks while testing. These measurements describe a returning cached account on Android with push disabled.


### Early Pray layout on returning phone launches

The native logo can hand off to the exported Pray layout on viewports up to 767 CSS pixels. It shows the four-tab navigation, header, empty composer and journal card placeholders. The layout reads only the cached session flag, theme and language. It contains no draft or saved journal content. A completed tap inside its text area requests focus on the live editor. The editor applies the saved privacy preference before paint. Native cover removal and release of deferred services are separate events. Journal reads still wait for the live screen. [Public layout](../../src/app/components/AppStartupShell.jsx) ? [Auth gate](../../src/app/components/AppAuthGatekeeper.jsx)

Ten alternating before/after pairs on the Galaxy A24 used isolated release builds with the same cached test account, empty journal, disabled push and local production exports. Each build had one warm-up. Each timed launch started from a stopped process. One foreground-focus check failed and that pair was repeated. Device launch command to native cover removal had a median of **1,438 ms before** and **1,085 ms after** (about 0.35 seconds earlier). The new range was 769?1,473 ms. This measures when the screen is shown. It does not measure time to the first saved note.

The phone recording showed the fixed logo giving way directly to Pray. A single tap near cover removal opened the keyboard and the typed test word appeared. Chromium and WebKit tests also held the JavaScript bundles, tapped the public layout, resumed hydration, and verified editor position, focus, privacy, the first character, and one native ready signal. Physical iPhone timing is outstanding. Compatible installed shells can receive the change through a web-bundle OTA update.
