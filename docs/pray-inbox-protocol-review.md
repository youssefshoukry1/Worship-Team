# Mission 6B — Implemented inbox protocol

Implemented and locally verified on 17 November 2026. Source: backend Utility/prayerDelivery.js, frontend services/prayerInbox.js and utils/prayerPayload*.js. See [verification and release notes](../performance/pray-mission-6b-report.md).

## Format and authorization

The inbox and sent-update endpoints always return the paginated protocol-2 format, including requests without a protocol query. The frontend requires this format and rejects unsupported responses. Release the backend and updated client together; older clients expecting full bundles require an update. Every query and payload request is scoped to the authenticated account; cursors never grant access.

## Pagination

- Inbox and sent replies use (createdAt, _id) keyset pagination; deletions use (deletedAt, _id). Compound indexes include the account and status filters. Replies intentionally use the immutable creation timestamp, including for legacy rows.
- Each response contains at most ten {shareId, isAnonymous} descriptors and nextCursor. Queries read at most eleven results to detect continuation. Payloads are downloaded separately.
- Versioned cursors carry account, kind, upper timestamp and last key. Validate their shape, dates and ObjectId. New arrivals beyond the watermark wait for the next scan.
- Delivery cursors are ephemeral. Each refresh starts again, so failed downloads/acknowledgements remain eligible. Acknowledging earlier rows cannot shift later pages as it would with offset pagination.
- Notification targets use a separate authorized request/task and never advance the ordinary cursor. Target and ordinary work share the download limit.

## Payloads and limits

GET /users/pray-time/inbox/payload/:shareId streams the object through the S3 SDK with backpressure. ?kind=reply returns the sender's pending reply. Recheck transit state after a slow object read; revocation returns 410, unavailable/already acknowledged returns 404/409. Release streams on completion, disconnect, failure or the 120-second timeout.

Both server and worker enforce **64 MiB per payload**, above the existing 50 MiB send-request limit. This bounds accepted payload bytes, not total process memory: JSON strings and decoded audio temporarily coexist. Previously stored objects exceeding the cap fail visibly and remain unacknowledged; they are never truncated or silently treated as delivered. Supporting arbitrary oversized historical objects would require a separate text/audio object format or migration and is not implemented.

Authenticated downloads, JSON parsing and base64 decoding run in workers. Transfer decoded buffers back; terminate workers on completion/failure/timeout/account change. A shared queue permits at most two workers, covering ordinary delivery and notification priority. Each scan consumes one payload at a time to avoid retaining ten large audio bundles. Cancellation checks run every 250 ms and between operations.

## Persistence, deletions and retries

Apply deletion pages before additions. Persist the final **last-seen deletion timestamp**, only after local tombstones commit, with inclusive timestamp replay on the next scan. Do not persist the scan's upper watermark: idle polling should not rewrite the history index. Ties replay safely through identity deduplication.

Persist text and all expected audio before acknowledging each share. Up to ten acknowledgements can be outstanding per scan, each with a ten-second timeout; await them before advancing the page. Yield between batches. Failed items do not block unrelated items; show Retry and rescan later. Duplicate delivery preserves existing read/reply state. Fresh mutations check tombstones, including during audio metadata commits and restore.

Stop new work when account ownership changes. Cancellation cannot undo a storage commit already in progress; retain the existing account/session storage rules. Credentials are transient worker inputs and are not saved with prayers.

## Verification boundary

Local tests cover actual HTTP, disposable MongoDB indexes, S3 SDK requests against a local object endpoint, production workers in Chromium/WebKit, two independent client stores, cursor ties, retries, anonymous audio, lost responses and revocation. This is not verification of deployed Cloudflare R2, push delivery, a physical phone or iOS runtime. No deployment or production data mutation was performed.
