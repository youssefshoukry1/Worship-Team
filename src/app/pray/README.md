> Current friend directory and request architecture: [Friends system report](../../../public/reports_informations/friends-system.md). Own-friend search now uses the local directory; online discovery and other users' friend lists remain server-paginated. This supersedes older own-friend API search descriptions below.

# Pray page — read before editing

Updated: 17 November 2026, after Missions 6B and 7. This is the entry guide for agents changing `page.jsx` or its dependencies. Read the affected source before editing, keep this guide current, and consult the [implementation plan](../../../docs/pray-performance-implementation-plan.md) for detailed evidence and unfinished work.

## Features and file map

| Responsibility | Main files |
| --- | --- |
| Page composition, local history, friends/profile data, inbox/replies, notification targets | `page.jsx` |
| Text and prayer-section drafts, voice recording, personal save, friend selection and anonymous sharing | `PrayerComposer.jsx`, `PrayerSharePicker.jsx` |
| Personal journal and Prayer Circle (all/received/sent), cards, replies, read state, retry/delete actions | `PrayerCards.jsx`, `usePrayerCircleOrder.js`, `usePrayerDeleteWindow.js` |
| Batches of 10, measured/windowed rows, keyboard focus, deep targets and reading anchors | `PrayerList.jsx`, `prayerListLayout.js` |
| Account-scoped draft/microphone/playback lifetime across tab navigation | `PrayerSessionProvider.jsx`, `prayerSession.js`, `prayerPlayback.js`, `usePrayRecorder.js` |
| Blur toggle/strength and backup settings | `PrayerSettings.jsx`, `PrayerBackup.module.css`, `BackupFrequency.jsx` |
| Saved recording controls, manual Drive backup/restore and native backup status | `PrayRecordings.jsx` |
| Persisted prayers, audio, cache snapshots, imports, revocations and ZIP orchestration | `../utils/prayRecordings.js` |
| Offline outbox and retries; native backup configuration | `../services/prayerSync.js`, `../services/prayerBackupService.js` |
| Paged inbox/replies, notification priority, download queue and payload decoding | ../services/prayerInbox.js, ../utils/prayerPayload.js, ../utils/prayerPayload.worker.js |
| Archive CPU work and worker lifetime | `../utils/prayerArchiveCodec.js`, `prayerArchive.worker.js`, `prayerArchiveTask.js` (all in `../utils/`) |

English/Arabic and RTL behavior use the language context and `prayerCircleText.js`. Blur is a visual privacy preference (`taspe7_prayer_privacy`), not encryption or a change to saved text. The current owned-prayer delete window is **60 seconds**; use the shared deadline hook and server rules rather than adding per-card countdowns. This page is separate from Friends/Profile testimony notes.

## Data flow and rules

1. **Local history is the UI source.** The legacy index key `guestPrays` contains personal, sent and received prayers, including signed-in sessions. Web uses the dedicated localforage `my_prays` store (index plus audio blobs). Native uses `Directory.Data/my_prays/index.json` and `my_prays/audio/`. Do not treat the currently rendered list or profile response as the complete history.
2. **Storage mutations go through `prayRecordings.js`.** It reads fresh transaction input, serializes mutations, publishes immutable snapshots only after persistence, and retains unchanged prayer/recording references. Warm UI reads use its cache. Web Locks coordinate cooperating tabs. Missing first-run data differs from corrupt/unreadable storage; errors must preserve history and expose Retry.
3. **Native writes require the bridge.** New binaries advertise `PrayerStorage`: fingerprint comparison, bounded reread/recompute retries, Android AtomicFile/shared lock, and iOS atomic replacement/shared queue. Backup readers use those helpers. Older binaries retain the legacy Filesystem adapter. Never fall back to a direct write after an available bridge fails. Retryable mutators must reset accumulated effects; remove audio only after a successful metadata commit.
4. **Sharing is durable before acknowledgement.** `preparePrayerAction` persists the action/request ID and expected audio count. Audio bytes precede committed metadata. Outbox jobs are owner-scoped, survive restart, and reuse request IDs on retry. Credentials are supplied by the session, not stored in prayer entries. Failed/incomplete local preparation must never silently upload partial audio.
5. **Incoming delivery can replay.** The page merges text by share identity, persists all expected audio, then acknowledges. Replies match exact share IDs/request IDs. Preserve reply timestamps and per-account read receipts. Apply revocations/tombstones before delivery/restore and inside fresh mutations; late replies, duplicate inbox bundles and old archives must not resurrect deleted prayers. Restored queued actions require explicit Retry.
6. **Backend contract matters.** Sharing/inbox/ack/reply/delete endpoints live in `backend/Controlls/Users-api.js`; transit/deletion models and object storage participate. Transport changes require acknowledgement-safe tests and coordinated backend/client release. Protocol 2 uses indexed keyset pages of ten descriptors for inbox, deletions and replies; this is the only supported response format, even without a protocol query; the frontend rejects old full-bundle responses. See [the implemented contract](../../../docs/pray-inbox-protocol-review.md). Payloads stream separately, parse/decode in workers, and have a 64 MiB cap with at most two workers across normal/notification work. Oversized historical payloads fail without acknowledgement.

7. **Delivery progress is not read state.** Keep delivery cursors ephemeral so failed items replay next scan. Apply deletion pages first and persist only committed last-seen deletion timestamps with inclusive replay. Deep notification targets use a separate task, never advancing the ordinary cursor. Consume one payload at a time; acknowledge only after complete persistence. Cancel stale account work, release workers, yield between batches, and retry pending deliveries automatically on polling, reconnect or foreground refresh. The page-wide sync notice and Retry sync button are intentionally removed. Do not reintroduce whole-inbox JSON parsing on the UI thread.

## Performance and lifecycle rules

- On a cold native launch the real header and editor signal splash readiness. The Pray view waits for that handoff before processing local history, running repairs and starting ordinary inbox/profile refreshes. An explicit notification can still request its target immediately. `ListPanel` shows card-shaped placeholders until the first local snapshot. The row renderer ships with the page so local cards can appear offline. An empty snapshot shows the empty state, and a storage failure exposes Retry. Warm returns reuse the session and cached rows.
- Keep the session provider outside disposable pager views. Drafts, recorder and active playback belong to that session; unmounting a row/page must not discard them. Release streams, players, Blob URLs and session resources on their actual completion/discard/account lifecycle.
- Render only the active list's measured viewport buffer, with the supported focused-row exception. Load in batches of 10; preserve per-scope anchors, measured heights, drafts and deep notification targets. Never restore the old retain-every-card approach. A tested traversal of 2,000 prayers mounted at most 16 cards; this is evidence, not a hard-coded universal row count.
- `PrimaryTabPager` retains active/neighbor pages. `useNavigationState` and navigation queues defer/coalesce view changes while dragging. Do not rebuild lists or measure hidden/transformed panels during gestures. Keep the composer and the selected list's bounded visible rows mounted while Pray is a neighboring panel, so return swipes show a complete layout. Inactive lists suspend measurement, ResizeObserver, scroll restoration and batch loading; the microphone waveform suspends visual work. The settings trigger stays in place; its portal and polling are active-page-only. The pager still releases Pray when it is no longer a neighbor.
- No storage reads, full-history sorting or serialization per keystroke/render/tab tap. Preserve memoized references and batched import/repair/audio metadata commits. Keep deadline scheduling shared rather than one timer per card. Native status polling belongs only to open, active backup settings.

## Backup/restore rules

- Preserve version-1 `prays.json` and `audio/<prayer>/<recording>` ZIP paths. Export **all persisted history**, even if only ten cards are loaded. Missing/unreadable audio fails the backup; restore validates required files before mutation. Never report an incomplete replacement as success.
- Manual archive compression/decompression and JSON encoding/parsing run in a dedicated worker. Transfer buffers; preserve caller ZIP bytes for retry. Terminate on completion, error, timeout or cancellation; no synchronous UI-thread fallback. Workers never own live storage or credentials.
- Restore yields between locked transaction phases and rechecks fresh state. Preserve audio ordering, newer replies/read state and concurrent revocations. AbortSignal cancellation before metadata commit rejects; an already-started commit is not undone, and interrupted audio writes can leave unreferenced bytes for later retry.
- Native scheduled backup runs independently of the Pray view. Intervals are off/7/14/30 days with Wi-Fi/account settings. Native bridge changes require a **new APK/iOS build**; OTA alone cannot install them. Worker/UI JavaScript updates can use the established OTA compatibility controls.

## Before finishing a change

Run checks appropriate to the affected paths; build before production-browser tests and avoid overlapping those runs. Added transport suites: tests/prayer-inbox.test.cjs and tests/prayer-payload.test.cjs; backend tests/prayer-delivery.integration.test.js uses disposable MongoDB and a local S3-compatible endpoint. Relevant suites: `tests/prayer-{activity,sync,storage-safety,atomic-bridge,delivery-compatibility,archive-task,list-layout,session,cache,backup,notification-navigation}.test.cjs`, `prayer-notification-opening.browser.cjs`, `prayer-session.browser.cjs`, `prayer-navigation.browser.cjs`, and `primary-tab-swipe.browser.cjs`. Native storage/backup changes also need Android `PrayerIndexStorageTest`/`PrayerBackupTest` and iOS build/runtime checks. See the plan/reports for exact commands and fixture provenance.

**Current status:** Missions 1-7, including 5B/6A/6B, are implemented and locally verified. Final build/lint passed; frontend 181/181 plus the added v2 browser test, backend 41/41. See [Mission 6B](../../../performance/pray-mission-6b-report.md) and [Mission 7](../../../performance/pray-mission-7-report.md) for measurements and limitations. DOM/player retention is bounded; the original baseline is preserved. Occasional navigation/layout frame spikes remain, so this is not a universal 60 fps guarantee.

**Release gates:** Deploy the backend and build its indexes before the updated client. Native atomic-storage changes need a new APK/iOS binary. Physical-device failure/restart/background-backup checks, iOS compilation/runtime/archive production, and deployed Cloudflare R2/push validation remain external checks. Local real HTTP/MongoDB/S3-SDK integration has passed; it is not a live-service test. Nothing was deployed.

## Return-navigation correction

The supplied Recording_20261117_021357.mp4 showed a collapsed Pray header and blank list during the return swipe, followed by the composer appearing and moving the page downward. Removed active-page-only mounting of the composer and selected list. Retain their bounded view while adjacent, suspend inactive list work, and preserve viewport/anchor state. See performance/pray-return-*.log for verification. This corrects the earlier recommendation to tear down all hidden Pray UI.

## Shared tab swipe behavior

The shared navigator uses recent movement speed (120 ms sample window), with a 18 px minimum and 0.4 px/ms threshold for a short flick. Slow drags commit at 18% of the viewport; a pause expires momentum and a quick reversal can cancel. Short failed drags ease back over approximately 240-320 ms, and committed flicks settle over 160-320 ms. Reduced motion uses zero duration. Logic lives in utils/interiorSwipe.js and components/PrimaryTabPager.jsx. Preserve vertical-scroll, selection, slider, modal and native-edge exclusions.


## Friend picker pagination (17 November 2026)

`PrayerSharePicker.jsx` now owns paginated friend/search reads through `usePeoplePage` and `PeoplePager`. It requests 10 people at a time only while opened; server-side friend/name search reaches friends beyond the downloaded pages. Authenticated `people-search` supplies relationship labels for other username results. `PrayerComposer` no longer receives an eagerly downloaded full friends array. The Pray page reuses downloaded friend metadata for optional enrichment and otherwise uses each prayer participant's saved metadata. Do not restore a full-list fetch just to populate the picker. See `../friends/README.md` for the endpoint, cache, migration and coordinated backend/OTA rollout contracts.
