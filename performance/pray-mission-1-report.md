# Pray performance baseline — Mission 1

Date: 16 November 2026. Application revision: `b058331` (backend `51ff3af`).

## Scope and reproducibility

This mission adds a measurement harness and records the existing behavior. It does not change application code, storage formats, or UI.

From `frontend`:

```powershell
npm.cmd run build
node scripts/measure-pray-baseline.cjs
```

The script overwrites `performance/pray-mission-1-baseline.json`. Use `PRAY_COUNTS` to select a smaller comma-separated fixture set when diagnosing the harness. The full baseline uses 10, 100, 500 and 2,000 total prayers, approximately one-third each personal, received and sent. Every twelfth item has two valid one-second WAV recordings; every tenth item has longer mixed Arabic/English text. All fixtures include section text.

Each scenario gets a fresh disposable browser context with actual IndexedDB/localForage data. All external API responses are intercepted; no real account, prayers, Google Drive upload or backend mutations are used. Run the benchmark without concurrent builds or browser test suites.

The UI is the production static export, running in Playwright Chromium with iPhone 13 viewport/touch emulation and 4x CPU throttling. The raw report records CPU, OS, Node/browser versions and revision. This is not an Android/iOS WebView benchmark. CPU throttling does not emulate a phone's GPU, storage, thermal state or native bridge.

## What the harness measures

- Navigation start to the first attached prayer card (includes startup and mocked initial reads; not a paint metric).
- Initial and post-browsing counts of rows, mounted cards, audio elements, waveform canvases, DOM elements and ready tab panels.
- Journal and Circle traversal, partial reverse scrolling, reply typing, external storage invalidation, trusted horizontal swipe cancel/commit, and repeated tab navigation.
- Animation-frame gap distributions, gaps over 34ms, main-thread long tasks and DOM mutation records for each phase.
- Actual browser prayer-index read/write and audio-read counts.
- JavaScript heap samples without forced garbage collection. These show snapshots, not a proven memory leak.
- Separate real storage-utility runs using mock localForage and native JSON filesystem adapters: cold load, 20 warm read pairs, and ten single-prayer updates.

Vertical traversal is a fixed scripted 700px step with a 25ms wait, capped at 600 steps. The report records whether the cap is reached. It is useful for comparing versions and retained resources, not simulating finger physics. Horizontal swipes use trusted CDP touch events and assert that the pager engages.

Audio counts traverse open shadow roots, where WaveSurfer places its media UI. Canvas counts can vary with visibility and are not a direct count of player instances. No active playback continuity claim follows from this count; the existing functional browser tests cover that behavior separately.

The external-update phase simulates another tab updating a prayer and emitting the actual BroadcastChannel invalidation. Its storage counters include one fixture read/write. It is not a simulated server delivery measurement.

Frame sampling uses a generation identifier so callbacks from a previous phase cannot contaminate the next phase. Initial harness smoke-run results were replaced by the corrected full run; only the final JSON is the baseline.

## Regression checks

| Check | Result | Interpretation |
| --- | --- | --- |
| Production build | Passed | Fresh static export built successfully |
| Combined frontend prayer units and prayer/navigation browser suites | 99 passed, 10 failed, 109 total | Existing failures recorded below; suite is not fully green |
| Prayer unit subset within that run | 47 passed | Cache, activity, sync, backup configuration and notification mapping |
| Backend prayer idempotency, revocation and push suites | 29 passed | Handler-level tests with mocked dependencies; not live MongoDB/R2/FCM integration |
| Isolated rerun of failed trusted swipe test | Passed | Failure did not reproduce alone; timing/concurrency sensitivity remains to investigate |

Artifacts: `mission-1-build.log`, `mission-1-frontend-tests.log`, `mission-1-backend-tests.log`, `mission-1-swipe-recheck.log`.

Nine failures are attributable to obsolete backup selectors: one native settings test still tries to check the old “Every 7 days” radio, and eight theme/viewport cases assert four radio buttons. The current implementation has a custom frequency menu. These tests stop at obsolete assertions, so their later layout/backup assertions are **not verified** by this run. Update the tests to the current menu in a subsequent mission without deleting their behavior checks.

The tenth failure was a trusted Friends-to-Profile drag timing out on navigation in the combined run. It passed when rerun alone. This is classified as an unreproduced timing-sensitive failure, not conclusively dismissed as a test-only issue. The combined run overlapped an early harness smoke check, so do not use its durations as performance evidence. The corrected benchmark runs separately.

## Validation gaps and next decisions

- `adb devices -l` reported no connected Android devices. No physical Android trace is available. iOS device profiling/build validation is unavailable in this Windows session.
- Production React commit counts are not measured. DOM mutation counts are explicitly not substitutes for React Profiler commits. A profiling build can investigate ownership changes in Mission 2 if required.
- Mock native storage timings exclude physical filesystem/bridge latency. Browser IndexedDB counters are real, but the storage utility microbenchmark uses in-memory adapters on the Node runtime without 4x throttling.
- Do not infer the exact cause of the user's mobile jank from emulated frame timings alone. Retained DOM/media counts provide direct evidence of unbounded UI lifetime.
- Restore, native archive compatibility and live two-client delivery need their planned integration/device checks; passing mocks is not evidence those environments were exercised here.
- Preserve the cache. Continue with state/audio ownership before evicting cards or the page, because their current component lifetime owns drafts and active recordings.

## Measured results

Corrected full run: all four scenarios completed without page errors; neither list traversal hit the step cap. Frame gaps below are p95 milliseconds, rounded to one decimal. These are individual scenario runs, not a statistical population of devices.

| Total prayers | Cards initially mounted | Cards after browsing both lists | Retained audio elements | Journal scroll | Circle scroll | Reply typing | Committed swipe |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 4 | 10 | 2 | 33.3 | 16.8 | 16.8 | 16.7 |
| 100 | 4 | 100 | 18 | 66.7 | 33.4 | 16.8 | 16.8 |
| 500 | 4 | 500 | 74 | 66.7 | 66.7 | 33.3 | 16.7 |
| 2,000 | 4 | 2,000 | 207 | 133.4 | 183.4 | 100.0 | 49.9 |

All those cards were still mounted after navigating to Friends. Depending on neighbor preparation timing, three or four ready app panels were mounted there. Initial lazy rendering is working, but retained UI grows with every visited item and follows the user to other pages.

At 2,000 prayers, the sampled JS heap grew from approximately 17.8 MiB initially to 34.3 MiB after browsing. This includes other page warming and allocations and was sampled without forcing GC; it is not a retained-heap attribution or a leak diagnosis. The external-update phase recorded a 51ms long task in this scenario. Use the raw JSON for per-phase maxima, p99 values, long tasks and storage counters.

| Total prayers | Mock web adapter update median | Mock native JSON adapter update median | Warm index reads across 20 read pairs |
| --- | --- | --- | --- |
| 10 | 0.22 ms | 0.19 ms | 0 on both |
| 100 | 1.08 ms | 1.55 ms | 0 on both |
| 500 | 5.05 ms | 7.49 ms | 0 on both |
| 2,000 | 20.72 ms | 30.87 ms | 0 on both |

The adapter microbenchmark includes the harness's cloning/JSON overhead; compare it only with the same harness on later revisions. It shows growing full-history transaction cost and confirms the warm cache avoids repeat reads. It does not establish how much time the real native bridge or disk takes.

### Decision for Mission 2

Proceed with state and audio ownership separation, then bounded list rendering. The measured growth in mounted cards/media and worsening scroll/typing gaps support that order. Keep the read cache, preserve all persisted data, and prevent transient state loss before changing view lifetime. Large-history storage work also merits Mission 5, but changing the storage schema is not required to address the confirmed DOM growth.

The baseline does not support claiming that every swipe is slow: the measured committed swipe was near a 60Hz frame interval through 500 items, then degraded in the 2,000-item case. Confirm the user's device behavior when a device trace becomes available.
