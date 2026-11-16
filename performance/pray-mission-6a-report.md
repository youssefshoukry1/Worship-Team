# Mission 6A — Archive worker

Date: 17 November 2026. Scope: web/manual archive processing only. Native background backup implementations, archive format, inbox protocol and deployment remain unchanged.

## Implementation

- `prayerArchiveCodec.js` contains compression/decompression plus JSON manifest encoding/parsing. The production build bundles it into `prayerArchive.worker.js`.
- `prayerArchiveTask.js` creates one worker per operation, transfers audio/output buffers, handles worker startup/runtime/message failures and a two-minute timeout, and terminates on success, failure or cancellation. It never falls back to synchronous ZIP work on the UI thread. Restore copies input ZIP bytes before transfer so caller retry/repeated restore can reuse them.
- `prayRecordings.js` still owns storage reads/writes, audio-before-metadata ordering, latest-state reconciliation, revocations, and native conflict retries. The worker receives data, never storage access or credentials. Restore yields between expensive transaction phases while retaining the existing transaction lock. Ordinary saves do not use those additional yields.
- Backup progress reserves the last portion for archive processing rather than reporting 100% before compression. The version-1 manifest and audio paths are unchanged.
- Both APIs accept an optional AbortSignal. Cancellation before metadata mutation rejects without committing restored prayers. As before, audio written before an interruption can remain unreferenced; retry safely reuses/rewrites it. A commit already in progress is not rolled back by cancellation. No new cancellation button or route-unmount cancellation was added, so existing background work behavior remains intact.

## Verification

Storage tests use the real codec directly and separately test worker transport/lifetime. Tests cover startup failure, worker error/message error, buffer transfer, input preservation after error, cancellation before/during execution, late messages, and worker cleanup. Restore tests cover cancellation, retry, and a revocation committed while decoding is pending.

The browser harness serves the **compiled production worker and Turbopack worker runtime** from `out`, using the production caller source against memory-backed storage. It exercises actual Chromium/WebKit workers, invalid ZIPs, cancellation, complete 2,000-prayer backup/restore, an 8 MB recording, and restore into a fresh store. It checks that no worker remains alive after each operation. The complete application browser suite separately exercises the actual production page/Drive restore path.

Evidence files:

- `pray-mission-6a-build.log`: production build.
- `pray-mission-6a-lint.log`: changed production JavaScript lint.
- `pray-mission-6a-unit.log`: 45/45 focused storage/compatibility/worker-unit checks passed.
- `pray-mission-6a-tests.log`: **173/173** combined regression checks passed. This run preceded the final MessageChannel scheduling refinement; the rebuilt application then passed **14/14** targeted production backup/restore checks in `pray-mission-6a-final-restore.log`.
- `pray-mission-6a-worker-browser.log` and `pray-mission-6a-worker.json`: browser worker validation and measurements.

## Performance interpretation

Worker execution removes ZIP compression/decompression and JSON encoding/parsing from the UI thread, but total operation time includes worker startup and transfer. A small backup can take longer overall while remaining responsive. Object cloning, live storage serialization/reconciliation, and garbage collection still have a main-thread cost.

Initial measurements found long restore gaps even after moving the codec. Those prompted yields after the worker response and between transactional phases; the lock and latest-state checks remain intact. Task yields use MessageChannel, closing both ports after each yield, to avoid nested timer delays.

The diagnostic harness covers the same text-only sizes as Mission 6 (10/100/500/2,000) and adds 8 MB audio. It records elapsed time, maximum timer gap and `postMessage` time. These are single-run desktop measurements with synthetic data and memory storage, not device frame percentiles or end-to-end IndexedDB/Drive timing. Timer gaps include scheduling/GC and are not equivalent to Long Tasks API measurements. Intermediate runs overlapping the regression suite are not final performance evidence.

Final measurements ran after the final production build, without concurrent builds or test suites. Both engines passed the actual-worker lifetime, malformed-input, cancellation and fresh audio-restore checks. Maximum timer gaps stayed below 50 ms in all final diagnostic cases; this is not a universal/device guarantee. An earlier WebKit measurement reached 62 ms, so variability and garbage collection remain relevant.

| 2,000 prayers | Chromium maximum timer gap | WebKit maximum timer gap |
| --- | ---: | ---: |
| Backup, text only | 9.7 ms | 26 ms |
| Repeat restore, text only | 26.8 ms | 35 ms |
| Backup, plus 8 MB audio | 12 ms | 17 ms |
| Repeat restore, plus 8 MB audio | 33 ms | 35 ms |
| Fresh restore, plus 8 MB audio | 38.4 ms | 35 ms |

For context, Mission 6's synchronous text-only Chromium backup/restore delayed a timer by 106/100.4 ms. The old measurement recorded a single pending timer; the new harness samples gaps throughout the operation, so these are diagnostic comparisons rather than identical statistical distributions. Final backup `postMessage` time at 2,000 items was 8.5 ms Chromium / 13 ms WebKit: structured cloning has a measurable cost even with transferred audio buffers.

Text-only total elapsed time was 136.2/122.9 ms for Chromium backup/restore and 134/226 ms in WebKit. The benefit is shorter uninterrupted UI work, not universally faster completion. These improvements do not establish mobile smoothness or eliminate every possible UI stall.

## Remaining gates

Physical Android/iOS WebView measurements and the earlier iOS native-build/device checks remain open. The iOS archive fixture remains a synthetic STORE-format contract; Android compatibility uses an archive generated by its real helper under Robolectric. Large inbox transport remains Mission 6B and is not modified here. Mission 7 still owns the final full-page comparison.
