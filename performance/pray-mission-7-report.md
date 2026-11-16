# Mission 7 — Final performance comparison

Completed local comparison and documentation on 17 November 2026. Missions 1-7, including 5B, 6A and 6B, have implementation and local verification evidence. Release validation on physical hardware and deployed services remains separate.

## Method and evidence

The original [Mission 1 baseline](pray-mission-1-baseline.json) is unchanged. [Final measurements](pray-mission-7-final.json) repeat the same 10/100/500/2,000 synthetic histories, production static export, real IndexedDB, mocked API, Chromium 145, iPhone 13 viewport and 4x CPU throttle on the same Windows/i5 host. Each scenario completed without captured browser errors.

The host is also running the user's applications/dev server. These are individual diagnostic runs, not statistical confidence intervals or physical-phone measurements. The revision field records HEAD; current uncommitted source changes are included in the built output.

**Comparison caveat:** the original script stops at the current document bottom. With pagination, that can be a batch boundary. Its scroll duration/count and whole-scroll long-task totals therefore are not equivalent full-history workloads. A separate full traversal waits across batches and verifies the last journal/Circle row. Existing regression coverage also reaches all 2,000 prayers with at most 16 mounted cards. Do not describe the shorter original script's traversal as having visited every prayer.

## Original-scenario results

| Total saved prayers | Mounted cards after Circle scroll, before → after | Repeated-navigation p95 frame gap, before → after |
| --- | --- | --- |
| 10 | 10 → 6 | 33.3 → 16.8 ms |
| 100 | 100 → 13 | 33.3 → 16.8 ms |
| 500 | 500 → 13 | 83.3 → 16.8 ms |
| 2,000 | 2,000 → 12 | 33.4 → 33.3 ms |

At 2,000 saved prayers:

| Interaction | p95 frame gap, before → after | p99 frame gap, before → after | Long tasks, before → after |
| --- | --- | --- | --- |
| Reply typing | 100.0 → 16.8 ms | 133.4 → 50.0 ms | 25 → 0 |
| Cancel swipe | 50.0 → 16.8 ms | 83.3 → 16.8 ms | 3 → 0 |
| Commit swipe | 49.9 → 16.8 ms | 50.0 → 33.3 ms | 3 → 0 |
| External storage update | 16.7 → 16.8 ms | 66.7 → 33.3 ms | 1 → 0 |
| Repeated navigation | 33.4 → 33.3 ms | 66.8 → 50.0 ms | 2 → 3 |

Initial rows fell from 667 to 1 for the long-card fixture. On Friends, Pray retained zero cards, audio elements or waveform canvases, versus 2,000 cards, 207 audio elements and 332 canvases before. After repeated navigation, the final DOM had 396 elements versus 37,404 before. Heap samples fell from about 101.5 MB to 33.0 MB; these are samples without forced GC, not a leak proof or equal-traversal memory benchmark.

Opening was not measurably improved: 2,000-prayer open-to-first-card was 1,559 ms before and 1,639 ms after. Warm cached reads still do no adapter reads. The complete interaction scenario still had five index reads/two writes, including fixture work. Isolated 2,000-entry update medians were 20.7 → 19.2 ms (mock web adapter) and 30.9 → 28.9 ms (mock native JSON adapter), but p95 worsened to 25.3/38.6 ms. Whole-index serialization remains proportional to stored history; this work does not claim a database schema migration or constant-time writes.

## Complete traversal supplement

The [full traversal](pray-mission-7-full-traversal.json) explicitly reached and asserted the final row of both lists: 667/667 journal prayers and 1,333/1,333 Circle prayers. Eight cards remained mounted at the end of Circle scrolling. This supplement uses the Load 10 more control when needed and waits for measured row heights; its timings are not the original fixed-stride workload.

Journal scrolling had a 33.4 ms p95 / 66.7 ms p99 frame gap and six long tasks (maximum 71 ms). Circle scrolling had 33.3 / 33.4 ms and two long tasks (maximum 73 ms). Typing and both swipe phases had 16.8 ms p95 with no long tasks. Repeated navigation had 16.8 ms p95 / 50 ms p99 and three long tasks (maximum 59 ms). Memory and DOM remain bounded, but the target of every frame meeting 16.7 ms is not achieved in this throttled test.

## Residual frame spikes and investigation

Repeated navigation still produces occasional roughly 50-60 ms tasks under 4x throttling, including with ten prayers. A [supplemental CPU profile](pray-mission-7-navigation-diagnostic-2000.cpuprofile) and [diagnostic run](pray-mission-7-navigation-diagnostic.json) identify PrayerList.measureViewport/getBoundingClientRect during React layout effects as a sampled layout cost, alongside React work and GC. This is evidence of residual mount/layout cost, not proof that every long task has the same cause.

The diagnostic navigation p95 was 16.8 ms, p99 49.9 ms, with three 52-62 ms tasks. Anchor restoration and variable-height/RTL/rotation behavior require correct measurements; this pass preserves their tested correctness rather than promising zero missed frames. No universal 60 fps guarantee is made. Device profiling remains necessary if the specific phone still stutters.

## Verification and release

Production build and changed-source lint passed. Full frontend regression passed 181/181; an additional real-worker v2 notification browser check passed separately. Backend passed 41/41, including disposable HTTP/MongoDB/S3-SDK integration and production workers in Chromium/WebKit. See [Mission 6B](pray-mission-6b-report.md) and earlier mission reports for commands and native fixture provenance.

The Pray [entry guide](../src/app/pray/README.md), implementation plan and protocol contract now describe final ownership, pagination, persistence, cancellation, backup and release rules. Obsolete retain-every-card behavior was removed in earlier missions; no equivalent path was reintroduced.

Release the new backend/indexes before the client. Previous native atomic storage requires a new APK/iOS binary. No device is attached to adb; Xcode/Swift are unavailable on this Windows host. Physical Android/iOS save/restart, gesture, background-backup and deployed R2/push checks have not been performed here. Nothing was deployed. These are explicit external release gates, not another unimplemented code mission.

Reproduce the original comparison from frontend after building:

    $env:PRAY_REPORT='pray-mission-7-final.json'
    node scripts/measure-pray-baseline.cjs

Supplemental full traversal uses PRAY_COUNTS=2000 and PRAY_FULL_TRAVERSAL=1 with a separate PRAY_REPORT filename. Optional PRAY_PROFILE=1 writes a CPU profile around repeated navigation. Keep diagnostic outputs separate from the original baseline.

## Delivery format update

At the user's request, the full-inbox/full-reply response and frontend fallback were removed after the original Mission 7 measurements. Inbox and sent-update endpoints now always return protocol-2 pages. The frontend rejects unsupported response formats. Backend and client must be released together; older installed clients expecting full bundles need updating. See pray-format-removal-*.log for the subsequent verification. Original measurements and test counts above describe their recorded runs.
