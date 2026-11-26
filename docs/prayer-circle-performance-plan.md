# Prayer Circle performance implementation plan

**Status** — Steps 1–5 complete. Verified on desktop, Galaxy A24 Chrome and the installed Android WebView.

**User experience** — Someone writing in My Journal should pay only for journal work and the unread badge. Opening Prayer Circle should show saved cards immediately, including offline, and refresh stale deliveries in the background. Returning from another tab should preserve the reader’s place.

## Behavior measured before implementation

Both lists expose local cards in batches of ten and window the rendered rows. A separate delivery protocol pages server descriptors in tens and can process several pages in one scan. The first ten visible cards therefore do not limit network work or the size of the shared local history index. The web and native stores both keep personal, received and sent prayer metadata together.

In [page.jsx](../src/app/pray/page.jsx), the initial inbox and reply checks and the 15-second timer depend on Pray being active and history being ready. My Journal meets those conditions. Shared sorting, unread filtering and [activity ordering](../src/app/pray/usePrayerCircleOrder.js) can also run while Journal is selected. Circle mounts on its first visit. On later Journal visits its wrapper stays hidden and its list body unmounts. The [list panel](../src/app/pray/PrayerCards.jsx) opts only the personal list out of the global 12 px backdrop blur. Android already suppresses card blur during horizontal tab swipes.

## 1. Establish the baseline

Use an isolated fixture account with personal, sent and received prayers, replies, unread activity and one recording. Exercise a small history and a large mixed history of 2,000 entries. Save the fixture, build identifier, device and WebView version, connectivity and test sequence for the final comparison.

- Open directly to Journal, wait 45 seconds, type, open Circle, scroll, return to Journal, and reopen Circle. Repeat offline and after navigating to Bible. Record inbox and reply requests separately from profile, outbox and read-receipt traffic.
- Count Circle sort/order passes and mounted rows. Measure opening to the first saved card, retained heap after settling, and slow frames during identical vertical flings. Measure cold launch to the editor separately from work after it appears.

**Deliverable** — A browser trace and an A24 baseline with at least five comparable runs for timings. Record ranges and medians. Identify any unavailable measurement before interpreting the results.

### Step 1 results, November 26, 2026

Production export 2.0.17, build `uF0eShWNutRDD21RZzjSV`, frontend revision `3e322c7`. Desktop Chromium 145.0.7632.6 and a physical Galaxy A24 SM-A245F running Android 16 with Chrome 158.0.8127.42 and Wasla's WebView 157.0.8103.52 used the same isolated fixture. Each history size ran in five fresh documents per environment. Each first trial included the 45-second idle period, offline open, reconnect and Bible round trip.

| Environment | Total prayers | Document to editor, ms | First Circle card, ms | Warm Circle reopen, ms | JS heap with Circle open, MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop | 30 | 183 (175–209) | 15 (14–15) | 11 (8–13) | 6.7 (6.5–7.2) |
| Desktop | 2,000 | 180 (169–224) | 13 (12–14) | 11 (10–13) | 8.8 (8.8–9.4) |
| A24 Chrome | 30 | 655 (606–675) | 36 (33–42) | 34 (33–53) | 7.7 (7.6–8.4) |
| A24 Chrome | 2,000 | 616 (579–676) | 42 (36–46) | 27 (19–39) | 9.6 (9.5–9.7) |
| A24 WebView | 30 | 724 (604–794) | 42 (38–49) | 28 (20–34) | 7.4 (7.4–7.5) |
| A24 WebView | 2,000 | 706 (607–814) | 39 (38–44) | 28 (22–30) | 9.0 (8.9–9.0) |

Values are medians with observed ranges. The editor measurement starts at document navigation. Card timing runs from selecting Circle to an animation frame containing a laid-out saved card. Heap is total used JavaScript heap after forced garbage collection in the open view. The fixture uses real IndexedDB, one playable recording, deterministic personal/sent/received entries, unread activity, replies and mocked API responses. Device filesystem latency, internet latency, process launch, native splash duration and presentation to the physical display are outside these measurements.

- **Idle traffic.** All six extended Journal visits made four requests each for deletions, inbox descriptors and sent replies: 12 ordinary delivery requests per 45 seconds, with no deliveries. Each also made one profile request and one prayer read-receipt request. Raw traces retain paths and phases separately.
- **Hidden work.** The extended Journal visits recorded two invocations each of shared sorting and activity ordering during initialization. Typing the draft added zero. Circle had zero mounted prayer cards before the first visit and after returning to Journal. The visited wrapper remains mounted. Check row counts and function invocations separately in future trials.
- **Offline and return.** Both fixtures opened saved Circle cards with API requests blocked. A24 Chrome took 37 ms and 70 ms respectively. The installed WebView took 20 ms in both runs. Each extended trial also navigated to Bible and back and recorded the returned row count.
- **Scrolling.** Circle had a computed 12 px backdrop blur. Across five identical touch gesture commands per size, A24 Chrome recorded 53 of 253 animation-frame intervals above 34 ms with 30 entries, and 39 of 271 with 2,000 entries. The installed WebView recorded 37 of 187 and 39 of 209 respectively. Desktop recorded zero of 272 at each size. Actual scroll displacement varied, including direction on some runs. These are main-thread callback intervals under remote automation. Step 4 needs a same-device blur-on/off comparison before attributing stalls to the filter.
- **Priority.** Start with ordinary polling. The request count is repeatable and the change has a direct acceptance check. Keep the existing row unmount and the independent read-receipt path. Measure memory and startup gains after each change.

Reproduce with the [benchmark and fixture](../scripts/measure-prayer-circle.cjs) against a production export. Run `node scripts/measure-prayer-circle.cjs` from the frontend directory for desktop. For phone Chrome, set `CIRCLE_DEVICE=a24-chrome` and `CIRCLE_CDP` to its forwarded debugging endpoint. The harness intercepts the test tab's network and instruments the two matching compiled functions in served copies. Recheck those probes after rebuilding. Review the [desktop trace](../performance/prayer-circle-baseline-desktop.json), [A24 Chrome trace](../performance/prayer-circle-baseline-a24-chrome.json) and [installed WebView trace](../performance/prayer-circle-baseline-webview.json) for individual samples and request phases.

## 2. Refresh deliveries when Circle is visible

In the Pray page’s refresh effect, require an active Pray page, selected Circle, a visible document, a ready local history and an authenticated account for ordinary delivery checks. Show the local snapshot immediately. Track freshness separately for inbox and replies within the account session. Reuse the current 15-second interval as the initial freshness window.

| Event | Intended behavior |
| --- | --- |
| Open Journal or leave Circle | Stop scheduling ordinary scans. Let a delivery already being persisted finish safely. |
| Open or return to Circle | Refresh each stale stream once. A recent successful check can satisfy a quick return. |
| Circle stays visible | Poll every 15 seconds while online. Coalesce overlapping open, reconnect, push and timer events. |
| Push arrives while Journal is visible | Mark the relevant stream stale. Keep the locally known unread count until delivery catches up. |
| User opens a prayer notification | Resolve the specific target immediately, including from another tab. Keep its task separate from ordinary stream freshness. |
| Offline, failed scan or account switch | Use saved cards offline. Leave unsuccessful work eligible for retry. Scope outstanding work, cursors and freshness to the account. |

Mark a stream fresh only after a successful ordinary scan. The current delivery wrapper catches failures internally, so explicitly propagate its outcome to the freshness decision. Preserve deletion-first processing, durable audio and metadata before acknowledgement, and safe replay. Keep outgoing sends and account read-receipt synchronization independent of the selected view.

**Pass when** a clean 45-second Journal visit starts zero ordinary inbox or reply scans, a stale Circle opens with one scan per stream, rapid reopening starts no duplicates, and push-tap, offline recovery, deletion and logout tests pass. Verify the missed-push tradeoff explicitly: the badge catches up on opening Circle.

**Step 2 result.** The session tracks successful inbox and reply scans separately. Routine checks run only for an online, visible Circle with a local snapshot. A push invalidates the affected stream even while the page is unmounted. A notification tap has its own delivery task. The new browser regression covers a failed reply scan, stream-specific invalidation, and quick Journal/Circle switches. The isolated fixture benchmark measured zero ordinary requests in every extended Journal visit after the change.

## 3. Defer hidden list work and preserve interaction state

Separate the Journal badge calculation from the Circle list. Derive the local unread count once per relevant snapshot or read-state change without sorting. Run Circle sorting, filter selection, activity maps and ordering only when Circle needs to display updated data. On return, process the newest snapshot once. Preserve the last visible rows during a pager swipe so the neighboring screen still paints correctly.

Keep the existing ten-card batches, stable IDs and windowing. Preserve filter, loaded count, scroll anchor, expanded prayer, reply draft, audio playback and the pending-updates affordance. Start with suspending hidden work. The list body already unmounts on a switch to Journal. Preserve that behavior and verify restoration before considering further changes to the wrapper. A storage-format migration is outside this change.

**Pass when** typing or receiving a local snapshot on Journal triggers zero Circle sort/order passes, the badge reflects locally known changes, and return navigation restores the same prayer and draft. Verify all four Circle filters and an unread item opened through a notification.

**Step 3 result.** The badge reads the local snapshot without sorting. Circle computes its activity order on the first selected visit per snapshot. An unchanged snapshot can reuse the sorted result after switching tabs. The ordering hook skips hidden Journal work. Device instrumentation counted zero hidden sorts and zero ordering passes in Journal, then one of each on first Circle open. Return navigation, focused replies, filter selection and playback use the existing session state.

## 4. Remove the list-sized glass effect

Give the Circle list wrapper the same blur exemption as Journal in [globals.css](../src/app/globals.css). Scope it to the list surface. Preserve its colors, card contrast, composer privacy blur and modal styling. Measure vertical flings with the same data and gestures as Step 1.

**Pass when** the settled Circle panel has a computed backdrop filter of `none`, its cards remain legible in both themes, and the A24 comparison records frame times and any visible blank frames. Report an inconclusive timing result if run-to-run variation exceeds the difference.

**Step 4 result.** CSS disables backdrop sampling on both growing list wrappers. On the A24 WebView, a separate same-build comparison applied the original 12 px filter to Circle only, alternating the condition across successive pairs. With both 30 and 2,000 entries, the median per-trial p95 animation-frame interval was 117 ms with blur and 50 ms without it (five flings per condition and size). These are callback intervals under automation. Light/dark and English/Arabic layout checks covered the list controls. See the [blur comparison](../performance/prayer-circle-blur-comparison-webview.json).

## 5. Verify the combined change and update the Pray report

Repeat Step 1 on the same browser and A24 WebView. Check startup, first and warm Circle opens, rapid Journal/Circle switching, main-tab swipes, long flings, offline reopen and reconnect. Run the existing prayer inbox, storage, session, list-layout and notification-navigation suites plus focused browser coverage for the new visibility rules. Record iOS coverage separately.

**Acceptance** — The request and hidden-work checks above pass, saved cards appear without waiting for the server, pagination and notification handling remain intact, and repeated tests show no reproducible regression in editor startup or warm swipes. Compare memory and frame times against baseline before claiming a gain. Update the [Pray page guide](../src/app/pray/README.md) with the verified refresh triggers, badge behavior, CSS scope, measurements and remaining limits. Submit the results for release review.

### Step 5 observations, November 26, 2026

The final production build passed. The Pray browser run passed all 47 selected cases, including notification opening during inbox pagination, offline recovery and traversal of 2,000 prayers. The traversal mounted at most 22 cards at once. The prayer unit suite passed all 103 checks. The Android and simulated iOS back-navigation and activity-read suites passed all 20 checks.

Three Friends request scenarios were excluded from the 47-case run. Two also failed on the baseline export, and the full mixed suite timed out. Those Friends scenarios remain unverified.

Repeated the Step 1 fixture with ten fresh documents per environment. The previous tables and the linked JSON files contain the matching baseline. These are medians, using the same definitions as Step 1.

| Environment | Total prayers | Document to editor, ms | First Circle card, ms | Warm Circle reopen, ms | JS heap with Circle open, MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop Chromium | 30 | 216 | 15 | 9 | 6.8 |
| Desktop Chromium | 2,000 | 165 | 16 | 10 | 8.3 |
| A24 Chrome | 30 | 643 | 43 | 34 | 7.9 |
| A24 Chrome | 2,000 | 636 | 48 | 40 | 9.6 |
| A24 WebView | 30 | 639 | 50 | 25 | 7.4 |
| A24 WebView | 2,000 | 631 | 54 | 34 | 9.0 |

- **Idle and offline behavior.** All six extended Journal visits dropped from 12 ordinary delivery requests to zero. Opening Circle issued the deletion, inbox and reply requests. All six offline opens rendered a saved card. The browser regression separately exercised per-stream failure, invalidation and freshness.
- **Tradeoff.** With 2,000 entries in the A24 WebView, moving preparation to Circle increased the first card median from 39 to 54 ms. Warm reopen went from 28 to 34 ms. Retained JS heap with Circle open was 9.0 MiB in both runs.
- **Main-tab swipes.** The archived baseline export and updated export each received five identical touch sequences per history size in the A24 WebView. The Bible-to-Pray return median changed from 576 to 537 ms with 30 prayers and from 571 to 520 ms with 2,000. These timings include the automated gesture and observation latency. [Before](../performance/prayer-circle-swipe-before-webview.json) and [after](../performance/prayer-circle-swipe-after-webview.json).
- **Scope.** Device measurements use Wasla's installed renderer with isolated fixture storage and API responses. Native process launch, device filesystem latency and physical iOS performance remain unmeasured. The primary timing export precedes the notification-only ordering correction. The final production export is used for the notification regression.

**Desktop startup recheck.** The small-history medians varied during the main run, so the archived baseline and final export were also run successively without other browser tests. Five fresh documents per size gave 123 to 119 ms at 30 entries and 83 to 83 ms at 2,000. This checks the editor handoff in the browser. [Before](../performance/prayer-circle-startup-before-desktop.json) and [after](../performance/prayer-circle-startup-after-desktop.json).

Updated traces: [desktop](../performance/prayer-circle-updated-desktop.json), [Galaxy A24 Chrome](../performance/prayer-circle-updated-a24-chrome.json) and [installed Android WebView](../performance/prayer-circle-updated-webview.json).

For a repeat measurement set `CIRCLE_RUN=updated` to retain the baseline files. With the installed WebView in the foreground use `CIRCLE_DEVICE=webview` and its forwarded CDP endpoint. The `blur-comparison` run alternates the filter across ten trials per size. The `swipe-before` and `swipe-after` modes measure a touch sequence in both directions; `CIRCLE_EXPORT` selects an archived production export. Device measurements exercise synthetic accounts and do not alter production prayer history.
