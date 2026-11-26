# Open the selected Prayer Circle message

The goal is for one notification tap to open the exact shared prayer or reply. When the message is already on the phone, the user should see it as soon as Pray becomes visible. When it still needs downloading, the user should immediately see which view is opening.

## Galaxy A24 baseline

Measured on November 26, 2026 in Wasla's Android WebView 157 using the 2.0.18 production web export, an isolated test origin and 2,000 synthetic saved entries. The timer starts when JavaScript receives the prayer-open event and ends on the first animation frame with the requested text in the viewport. Three runs per scenario give a baseline for comparison. [Raw trials and request sequences](../performance/prayer-notification-a24-baseline.json)

| Starting view and target | Three runs (ms) | Median |
| --- | --- | --- |
| Pray, saved incoming prayer | 83, 63, 62 | 63 ms |
| Pray, saved reply | 70, 53, 48 | 53 ms |
| Friends, same saved incoming prayer | 463, 485, 479 | 479 ms |
| Pray, incoming prayer requiring download | 725, 758, 828 | 758 ms |

The cross-tab event went unclaimed in all three runs. The harness then loaded the fallback document path in the same WebView to model the native navigation. The download fixture added 120 ms per prayer API request. Native file storage, Android notification-tray dispatch, process launch, real server latency and audio delivery were outside this measurement. The numbers describe the tested segment of a warm open.

## What accounts for the wait

- **Cross-tab routing is the first change to make.** The push handler dispatches a cancelable event. Only the active Pray page listens. From Friends, native fallback uses document navigation and Pray has to initialize again. The median gap for opening the same saved message was 416 ms. [Push handler](../src/app/services/pushNotificationService.js) · [Document fallback](../src/app/utils/appNavigation.js) · [Pray listener](../src/app/pray/page.jsx)
- **An uncached message has a separate delivery cost.** The incoming path processes deletion pages before requesting the selected descriptor and payload. For a reply, even a target-only sync first requests a general replies page. Opening Circle can also start ordinary sync while the selected message competes for payload capacity. Some requests overlap. Their durations cannot simply be added together. [Delivery order](../src/app/services/prayerInbox.js) · [Payload queue](../src/app/utils/prayerPayload.js)
- **The list already jumps to locally saved messages.** It keeps variable-height virtualization and navigates in logical batches. Only five cards were mounted when the deep saved target became visible in these trials. Replacing the list or loading Circle during ordinary Journal startup has no demonstrated benefit here. [Prayer list](../src/app/pray/PrayerList.jsx)

## Implementation sequence

Proceed one step per approval. Record results after each step.

1. **Route notification taps through the running app.** Give the application shell one owner for validated prayer-open intents. Use the existing in-document tab navigator, retain the target while Pray mounts, and consume it once for the signed-in account. Handle duplicate Android callbacks and let the most recent distinct tap win. Retain the launch URL path for a fresh process. Verify from Pray, Bible, Friends and Profile, including nested routes and taps during swipe transitions. A warm tap must keep the document and reach the correct message without adding a duplicate history entry.
2. **Open the saved target as soon as its view is ready.** Use the current local snapshot and existing expansion and jump logic. Distinguish a saved reply from a sent prayer still waiting for its reply. Coalesce redundant refreshes while preserving normal reconciliation. Verify offline, deep targets, long prayers, large fonts and replies below the original message. Measure the requested text itself. Adjust positioning only where a case fails. Clear pending work on logout, account change or a superseding tap. Keep read receipts tied to actual visibility.
3. **Prioritize a missing message.** Start its authorized targeted delivery as early as correctness permits. Skip the general replies read in target-only mode. Keep the existing worker concurrency limit and prioritize the selected payload ahead of queued background work. Preserve deletion ordering, durable storage, recording handling, acknowledgements and ordinary cursor progress. If deletion pages dominate a trace, validate a safe ordering before parallelizing that work. Show a small pending state inside Circle when needed and handle deleted, offline or unavailable targets without marking anything read.
4. **Validate the complete tap on the A24.** Repeat the baseline and exercise real Android notification-tray taps with test accounts on the installed app. Measure OS tap to first visible navigation feedback and to readable content separately, with the app foregrounded, backgrounded and cold. Include incoming prayers, new replies, repeated taps and account changes. Use at least 20 warm trials per key scenario and report median and p95. Proposed warm target for saved cross-tab messages is a median below 150 ms from JavaScript receipt, with no document replacement. Compare startup, swipe smoothness and Journal background traffic against baseline. Record the verified behavior in the Pray report after acceptance.

Step 1 can be evaluated independently. If it closes the cross-tab gap, keep its result separate from any improvement in network delivery or native cold launch.

## Step 1 result

Implemented and tested November 26, 2026. The signed-in navigation shell claims a targeted prayer tap and switches tabs through the same client navigator used by the bottom bar. Pray consumes the latest target for that account after its route commits. The launch URL still carries the target when document navigation is necessary.

On the Galaxy A24, the Friends-to-saved-prayer runs took 307, 179 and 453 ms. All three kept the same WebView document. The median was 307 ms versus 479 ms in the baseline, a 172 ms reduction. Three trials show the observed range. The proposed 150 ms target remains open. Browser regression coverage includes the primary tabs, Plans, interrupted swipes, duplicate callbacks, superseding taps, history length and the native index entry. Real tray-tap and cold-start measurements remain in Step 4. [Step 1 phone trials](../performance/prayer-notification-a24-step1.json)

## Step 2 result

Pray now resolves a saved notification against the current in-memory snapshot while selecting Circle and expanding the target. Saved targets skip the separate targeted request. Ordinary Circle reconciliation still runs. A pending sent prayer still requires its reply to arrive. An offline missing target can resume at reconnect, and the latest intent and active account guard target-specific work.

An offline browser regression reproduced a long original hiding the requested reply below the viewport at 24 px root font size. The virtual list now uses the measured reply position and accounts for the change from collapsed to expanded row height. The test verifies visible, unobstructed reply text, including after a superseding tap. Read receipt visibility checks remain in place.

The final A24 build showed no target request before visibility in any of the nine saved-message trials. From Pray, saved incoming text took 66 ms median and saved replies took 65 ms. From Friends, the same saved message took 454 ms median (450–504 ms), slower than the Step 1 sample. All opens retained the document. The small samples do not demonstrate a cross-tab latency improvement or establish how much time route activation accounts for. Separate route commit, Pray mount and first visible text in the larger Step 4 comparison. Missing incoming messages took 794 ms median with the same simulated network delays. [Step 2 phone trials](../performance/prayer-notification-a24-step2.json)

## Step 3 result

The targeted reply task skips the general replies page. The targeted incoming task fetches the authorized descriptor alongside the deletion pages, then waits for deletion reconciliation before requesting the payload. The next free worker serves the selected notification ahead of queued background downloads. Active downloads can finish and concurrency stays capped at two. Ordinary Circle synchronization still owns its own paging and reconciliation.

Only a missing target shows inline progress. The offline state waits for reconnect. A removed or unavailable target leaves the list usable and does not mark any other card read. The production build, 12 transport and worker tests, and seven targeted browser scenarios passed. These include revocation on the last deletion page, out-of-order descriptor arrival, exact reply matching, worker priority, offline recovery, anonymous audio and durable acknowledgement.

On the Galaxy A24, a missing incoming prayer became visible in 609 ms median (591–658 ms), compared with 794 ms in Step 2 under the same simulated 120 ms request delay. Missing replies took 558 ms median (514–653 ms). From Friends, a saved prayer took 455 ms median, compared with 454 ms in Step 2. Each scenario had three trials. All 15 opens kept the same document. These measurements start at JavaScript notification receipt. [Step 3 phone trials](../performance/prayer-notification-a24-step3.json)

## Step 4 validation

On November 26, 2026 the Galaxy A24 completed 100 warm notification opens in the production web export. Every tap was claimed, kept the same document and showed the requested text. There were 20 trials per scenario with 2,000 fixture entries. The median averages the two middle observations. P95 uses the 19th sorted observation. Times run from the JavaScript event to the first sampled frame containing the requested text in the viewport. The download scenarios use 120 ms of simulated delay per prayer API request. [Warm measurements](../performance/prayer-notification-a24-step4.json)

| Start and target | Median | P95 |
| --- | ---: | ---: |
| Pray, saved incoming prayer | 63 ms | 71 ms |
| Pray, saved reply | 61.5 ms | 69 ms |
| Friends, saved incoming prayer | 365 ms | 490 ms |
| Pray, missing incoming prayer | 616.5 ms | 659 ms |
| Pray, missing reply | 589.5 ms | 660 ms |

**The saved cross-tab target of 150 ms remains unmet.** From Friends the median sampled milestones were 9.5 ms for the Pray tab highlight, 114 ms for the Pray route address, 312.5 ms for the Pray editor DOM and 365 ms for the message. Each trial started on a fresh Friends document. Pray is outside the pager’s mounted neighbors there. The next investigation should isolate route payload and component loading from local snapshot and Circle rendering, and separately measure revisits from an already-used app session.

### Android notification tray

A separate debug package used the Step 3 export, the production notification renderer, Capacitor tap listener and native prayer storage. A local test broadcast posted alerts for a synthetic incoming prayer and reply. The test tapped the actual Android tray entry and verified the matching text in the WebView. External web requests were blocked. Android suppressed foreground tray notifications as designed. Each row is one observation. [Android tray measurements](../performance/prayer-notification-a24-step4-tray.json)

| Process at tap | Target | Tap to JS notification action | Tap to text in WebView |
| --- | --- | ---: | ---: |
| Background | Incoming prayer | 188 ms | 475 ms |
| Background | Reply | 159 ms | 363 ms |
| Cold | Incoming prayer | 2,261 ms | 2,335 ms |
| Cold | Reply | 2,621 ms | 2,708 ms |

The cold cases verified a new process ID. Most of the observed cold delay elapsed before the JS tap callback. These measurements include Android input dispatch and use WebView frames as the endpoint. They exclude FCM delivery time before the notification appears and do not establish the exact frame when an OS animation or splash stops covering the WebView. The side-by-side test package was removed and the original app returned to the foreground.

### Journal and navigation checks

With 2,000 entries, Journal made zero inbox or replies requests across 45 seconds. Across five fixture runs the median time to the editor was 474 ms. Median gesture-to-tab-commit times were 752 ms toward Bible and 604 ms back to Pray. The earlier 2.0.17 phone run measured 441, 677 and 520 ms respectively. This older comparison used a different build and the current run sampled animation frames during the gesture, so it cannot isolate the cost of notification changes. Current pooled frame-gap P95 was about 33 ms in both directions. Seven targeted browser scenarios and 15 native notification unit tests passed, including swipe round trips, interrupted navigation, account changes and notification rendering. [Current Journal and swipe measurements](../performance/prayer-circle-swipe-notification-step4-webview.json) · [Earlier phone measurements](../performance/prayer-circle-swipe-after-webview.json)
