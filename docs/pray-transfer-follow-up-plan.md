# Focused transfer-performance follow-ups

Created after Mission 6 measurements on 17 November 2026. Missions 6A and 6B are implemented and locally verified. The user authorized completion without further mission pauses on 17 November 2026.

## Mission 6A — Move web archive processing off the UI thread

Status: implemented and locally verified. See the [Mission 6A report](../performance/pray-mission-6a-report.md). Archive codec runs in a dedicated worker; restore yields between locked storage phases. Final desktop diagnostic timer gaps were below 50 ms for the tested text/audio cases. Real-device validation remains open.

Evidence: the isolated desktop Chromium fixture with 2,000 prayers took 105.4 ms to build a ZIP (106 ms timer delay) and 92 ms to restore it (100.4 ms timer delay). This uses synthetic text and memory storage; audio, actual IndexedDB and mobile devices need separate measurements. Native automatic backups already execute through native workers/queues.

1. Move ZIP compression/decompression and manifest encoding/parsing into a dedicated worker; use transferable buffers and terminate the worker on completion/failure. Measure structured-clone overhead rather than assuming worker usage removes all stalls.
2. Preserve the existing archive format, full-history inclusion, strict missing-audio behavior, progress display, and retryable error handling. Audio and metadata commits must retain their current order and revocation checks. Keep worker results separate from live storage mutation.
3. Test failed worker startup, invalid archives, cancelled work, concurrent deletion, queued actions, large audio, and Android/iOS-format imports. Do not change native archive formats.
4. Repeat identical backup/restore timing cases plus large audio in a production browser build. Exit: archive CPU work no longer produces UI-thread tasks over 50 ms in the tested scenarios; document device limits. Pause for user continuation.

## Mission 6B — Bound inbox transport and local ingestion

Status: completed locally. The [implemented contract](pray-inbox-protocol-review.md) and [Mission 6B report](../performance/pray-mission-6b-report.md) record descriptor pages, bounded streamed payloads, worker decoding, retries and integration evidence. Payload cap: 64 MiB; oversized historical objects remain pending rather than truncated.

Evidence: 2,000 synthetic inbox entries produced 3,040,891 JSON bytes, a 45.3 ms merge and 51.3 ms timer delay on desktop. Before Mission 6B, the controller retrieved all pending transit entries and loads their object-store bundles sequentially before returning; audio can increase response size substantially. These figures exclude HTTP, database, object-storage and decoding costs.

1. Use the paginated protocol as the sole supported format. Remove the full-bundle response and frontend fallback; coordinate the backend/client release. Use a stable server cursor, never offset pagination over a queue whose entries disappear after acknowledgement.
2. Keep delivery cursor and deletion cursor separate. Persist all expected audio and text before acknowledging each share; retain unacknowledged bundles across reload/retry. Recheck revocations after slow reads. Do not advance in a way that permanently skips a failed item.
3. Bound server object-storage concurrency and response bytes/items. Let notification targets resolve promptly without requiring every older delivery to finish. Specify behavior for large single recordings and expired/deleted entries before coding.
4. Batch local transactions and yield between bounded batches. Test two clients, lost/duplicate acknowledgements, crash/restart, newer arrivals, concurrent deletion, anonymous sharing, and old/new client compatibility using a test database/object store.
5. Measure HTTP bytes, end-to-end latency, UI long tasks and ordering under realistic queue sizes. Exit: bounded payload/work with no skipped or resurrected prayer. Pause before Mission 7.

Both follow-ups and the [final performance comparison](../performance/pray-mission-7-report.md) are complete locally. The numbered steps above are the original scope; results and deviations are in the reports. They do not replace the open iOS build and physical-device save/restart/backup verification gates.
