# Pray performance implementation plan

Date: 16 November 2026  
Status: Missions 1–4 and 5A complete; 5B implemented. Missions 6 and 6A locally verified with documented platform/service gaps. Paused before Mission 6B (bounded inbox transport/ingestion); final comparison remains Mission 7.  
Reviewed revisions: frontend `b058331`, backend `51ff3af`.

## Working agreement

The user requested a staged implementation with a pause after one or two steps.

- Each numbered mission below is one implementation step.
- Complete the mission's verification and update this file before marking it done.
- Default: pause after **each mission**. Never complete more than two missions without asking the user to continue.
- At each pause, report changes, test results, remaining limitations, and the next mission. Wait for an explicit continuation before starting it.
- Creating this plan does not start Mission 1. No application code was changed during this review.
- If a mission reveals a dependency or correctness problem, document it and revise the affected scope before proceeding. Do not combine unrelated fixes into a large rewrite.

## Objective

Make scrolling and navigation smooth on mobile while preserving local prayers, recordings, offline actions, sharing, replies, unread state, notifications, and backups. Keep the existing visual design.

The intended list experience is the newest 10 prayers initially, followed by batches of 10, with a bounded number of mounted cards. Loading ten more must not mean permanently retaining ten more players and card trees.

Source inspection identifies risks; it does not prove which operation causes a specific phone's dropped frames. Production profiling and regression checks are required. No review can guarantee zero errors.

## Verified system map

### Storage on web and native apps

| Concern | Web | Android / iOS |
| --- | --- | --- |
| Adapter | `localforage.createInstance({ name: 'my_prays' })` | Capacitor Filesystem, `Directory.Data` |
| Text and metadata | One `index` item | `my_prays/index.json` |
| Audio | Separate Blob entries named `audio_<recordingId>` | Separate `my_prays/audio/<recordingId>.<ext>` files |
| Playback URL | Object URL; caller must revoke it | `getUri` followed by `Capacitor.convertFileSrc`; not a browser Blob URL |
| Manual backup | JavaScript ZIP creation and direct Google Drive upload | Native backup plugin when available; JavaScript fallback otherwise |
| Scheduled backup | Not available | Android WorkManager / iOS background engine |
| Restore | Shared JavaScript ZIP importer writes through the adapter | Same importer writes native files through the adapter |

The web store normally uses IndexedDB; the code does not explicitly force a localForage driver. Do not describe it as localStorage or assume every browser has the same persistence behavior.

The index includes `guestPrays`, `recordings`, `pendingWords`, `revokedPrayerShares`, and `prayerDeletionCursors`. Despite its name, `guestPrays` contains current local prayers for signed-in users too. The index is device/browser-wide, not a database per user. Outbox jobs and read receipts have owner identifiers. Preserve those distinctions; account-storage migration is not implicitly part of this performance work.

The in-memory cache deduplicates reads and preserves unchanged object references. `_indexLock` serializes writes within one JavaScript runtime. Each transaction still reads the entire persisted index, optionally writes the entire index, and publishes a reconciled snapshot. BroadcastChannel and foreground visibility invalidate cached data. This is not a cross-tab transaction lock, nor a lock shared with native backup workers.

### Saving and recording

1. The composer serializes general text and typed sections, assigning audio to a section by `sectionIndex` / `blockType`. Voice-only sections use an internal text marker.
2. It immediately inserts a local card with a stable local ID and `_sync` action, then resets the form.
3. `preparePrayerAction` retains recording Blobs independently of the route, persists the action, writes audio, then settles a personal save or makes an outgoing action pending.
4. Storage failure leaves a retryable in-memory copy. Interrupted preparation checks expected audio count before allowing a send.
5. One shared MediaRecorder manages general/section recordings. Its current hook is owned by the Pray page; unmounting it cancels recording. Saved waveform/player lifetime currently follows the mounted card.

### Sending to another user

1. The picker uses cached friends plus debounced username search; it can select a discovered non-friend too. Do not introduce a friends-only restriction during optimization.
2. A `send` action persists locally before the outgoing request. Audio for that prayer is encoded as base64.
3. `POST /users/pray-time/share` receives text, recipient, anonymity, audio, and a stable request ID.
4. The backend derives an idempotent share ID, manages an upload lease, puts the bundle in Cloudflare R2, and records transit metadata in MongoDB. It sends a push after publishing the share.
5. Successful response attaches the server share ID/date to the same local card. Retry must reuse the original request ID.

Anonymity masks sender information in the recipient payload/UI. The backend still knows the authenticated sender. The storage module's header comment saying audio only leaves for backup is outdated: explicit sharing sends audio too.

### Receiving, acknowledging, and replying

1. Pray checks `/inbox` and `/sent-updates` when active, on relevant refresh signals, and every 15 seconds while active/visible. `runSessionTask` coalesces work across mounts; forced refreshes queue a follow-up.
2. Inbox delivery applies deletion records, merges text using share identity, saves missing clips, then acknowledges each persisted bundle.
3. `/ack` removes its R2 object and changes pending transit status to delivered. **Never acknowledge before text and all expected recordings are durably available.**
4. A reply updates the local received card optimistically and queues `/confirm-share`. Backend transit stores reply text/time temporarily and pushes the sender.
5. The sender applies replies by exact share ID before `/sent-ack`; that acknowledgement clears server reply content. Ambiguous legacy recipient matches are deliberately rejected locally.
6. Transit records have a 30-day MongoDB TTL. Durable deletion records are separate. This is delivery transport, not a cloud history endpoint.

`readTabJson` already waits for navigation idle before JSON parsing and result delivery. Storage publication and outgoing sync processing do not have equivalent coordination. Preserve the useful existing mechanism rather than adding a duplicate scheduler.

### Deletion, unread state, and notifications

- Personal/sent prayer deletion is limited to the first minute; received prayers have no delete button. These are prayer rules, separate from testimony-note editing rules.
- Sent deletion requires backend confirmation. Persisted revocations prevent late replies, deliveries, or restored backups from resurrecting deleted prayers. Failures must restore a visible actionable card.
- Unread state is keyed by activity and owner. An expanded card becomes read only when actually visible. Preloading, virtual measurement, or an inactive tab must never mark it read.
- Circle order is deliberately held while typing, playing audio, or reading farther down. New activity is revealed through the existing updates control.
- Notification targets use exact share IDs. A reply target waits for its payload. The current implementation locates a mounted DOM card; virtualization requires explicit ID-to-index navigation instead.

### Backup and restore

- JavaScript export produces `prays.json` plus audio entries in `my prays.zip`, retaining share state, read markers, pending actions, and revocations.
- Android and iOS archive builders read `index.json` and audio directly, plus `backup-prayers.json` as an account marker. Changing the storage schema requires coordinated changes to both native readers.
- Native backup streams audio; JavaScript export gathers bytes and uses synchronous `zipSync`, while restore uses `unzipSync`. Large manual web backup/restore is a separate potential UI stall, not evidence of ordinary scroll lag.
- Native builders fail if an expected audio file is missing; JavaScript export currently skips missing audio. Record this behavior difference; do not silently change it as part of list rendering.
- Restore merges identity and newer reply/read state, carries revocations forward, resets deletion cursors, and restores pending actions as failed/manual-retry rather than silently resending them.
- Pagination must never limit backup/export or synchronization to the currently displayed ten prayers.

## Findings and priorities

| Priority | Finding | Consequence / response |
| --- | --- | --- |
| High | `RetainedPrayerList` creates a row for every item and never evicts visited cards | DOM and retained resources grow with browsing; implement real windowing |
| High | Pray stays mounted after visiting; both inner lists remain mounted after use | Hidden UI and subscriptions accumulate; separate session state from view lifetime |
| High | Saved voice players stay alive after first entering the viewport | Bound inactive waveform/player resources; preserve the active playback session |
| High | Every index transaction scans/reconciles all prayers and recordings; multiple publications per action | Reduce duplicate work and batch operations without weakening durability |
| High, correctness | Any index read error becomes an empty index | A later mutation can replace history after a read/parse failure; distinguish missing from failed reads before storage refactoring |
| Medium | Reply input changes the shared rendering callback; recorder timer belongs to the page | Isolate rapidly changing state and subscribe at smaller boundaries |
| Medium | Placeholder/card height estimates differ from actual variable-height content | Measure and restore stable anchors; test long Arabic/English text and audio |
| Medium | Backup status polling and local subscriptions outlive active view | Suspend unnecessary UI work, keep durable sync and native backup running |
| Medium | Legacy import/decryption uses per-entry updates; inbox audio adds metadata per clip | Batch appropriate metadata work while retaining delivery guarantees |
| Medium | Shared-user profile resolution linearly scans friends per rendered card | Build stable ID/username lookup maps when friends change |
| Reliability boundary | JS lock is runtime-local; native archive reads do not share it | Test concurrent access; do not optimize writes by blindly trusting cached state |
| Maintenance | Page combines composer, list, picker, sync, migrations and dialogs; stale comments/styles remain | Extract by ownership and remove only verified-unused code |

## Design decisions

1. Keep the existing storage schema during the initial performance work. Ten-item display batching is **UI pagination**, not ten-item disk reads. Genuine storage pagination needs a separately designed migration if profiling later justifies it.
2. Mission 3 inspected the installed `react-virtuoso` API first. Its prefix-retention option cannot pin just one arbitrary focused editor. Use the small measured `PrayerList` window with one focused-row exception, a 240 px buffer, window scrolling, and per-filter item anchors. No second windowing library was added; isolated layout and browser regressions cover this decision.
3. Separate persisted domain data, transient session state, and mounted UI. Preserve drafts, section recordings, selected recipient/anonymity, reply drafts, expanded IDs, filters, and scroll anchors across normal tab navigation. Explicit discard/save still clears the relevant state.
4. Own active recording/playback outside disposable rows. Release unused player resources; do not stop audio simply because a row scrolls away. Bound any temporary pinned view exceptions.
5. Keep persistence and user-visible saving truthful. Defer expensive derived UI work during gestures, not essential writes, acknowledgements, or error handling indefinitely.
6. Preserve language, RTL, privacy blur, current colors, settings controls, and accessibility. Plain browser Find will no longer cover unmounted history; document this tradeoff and retain keyboard-accessible loading/navigation. A new history-search product feature is outside this plan.

## Mission sequence

### Mission 1 — Establish a reproducible baseline

Status: [x] Complete in the available environment; real-device and React-profiler gaps documented.  
Dependency: user authorized Mission 1 with “make it”.

- Create production-mode scenarios with 10, 100, 500, and 2,000 synthetic prayers: mixed personal/sent/received, long text, multiple sections, unread replies, and recordings.
- Profile initial opening, deep scrolling in both directions, repeated tab swipes after visiting Pray, reply typing, background incoming updates, and returning to the same scroll position.
- Record mounted rows/cards/players, React commits, long tasks, frame gaps, index reads/writes/publications, and memory trends where supported.
- Exercise the native storage adapter as well as web IndexedDB; mark mocks explicitly. Obtain an Android WebView trace and an iOS device trace when available. Unavailable device access remains an explicit validation gap.
- Run current functional suites and classify any pre-existing failures before changing behavior. Use disposable fixtures, never the user's real prayer history.

Deliverable: baseline report and repeatable harness with runtime/device/build identifiers. The existing swipe benchmark needs a scenario that first visits and scrolls Pray; a Friends-only swipe misses this retention issue.

Delivered: `scripts/measure-pray-baseline.cjs`, `performance/pray-mission-1-baseline.json`, and `performance/pray-mission-1-report.md`, plus build/regression logs. No connected Android device was available; no physical-device timings or production React commit counts are claimed. Obsolete backup selectors and a timing-sensitive swipe test are recorded in the report. Updating those selectors while preserving their assertions is an explicit prerequisite to relying on that coverage in subsequent missions.

Exit: baseline is reproducible and the biggest costs are identified or clearly marked unmeasured. **Pause and ask to continue.**

### Mission 2 — Separate state and resource ownership

Status: [x] Complete  
Dependency: Mission 1.

- Extract composer, share picker, list/card presentation, and settings responsibilities incrementally; keep existing storage APIs and layout.
- Introduce explicit transient session ownership for composer/reply drafts, filters, expanded state, scroll anchors and pending recording Blobs. Match current navigation persistence; do not add permanent draft storage implicitly.
- Move recorder/session lifetime out of the disposable list/page view. Define active playback ownership so virtualization does not destroy the playing clip. Clean up on discard, replacement, logout/session changes, and completed save as appropriate.
- Isolate recorder ticks and blur slider state from saved-list renders. Use stable per-card data/actions; create friend lookup maps.
- Define account-switch handling explicitly. Session state must not send a previous account's draft/action under new credentials; existing device-wide saved-history behavior is not silently migrated.

Exit: typing/recording does not recommit unrelated saved cards; drafts and audio survive normal navigation; no duplicate recorder or leaked URL/player. Existing save/share/retry tests pass. **Pause and ask to continue.**

Delivered: account-scoped transient session with field subscriptions, persistent microphone host, session-owned playback/media, extracted composer/picker/settings/cards, friend lookup maps and scroll-offset capture. Production build passed; targeted lint has no errors and one preserved avatar `<img>` warning. Final combined unit/browser/navigation run passed 120/120. The three actual-route-unmount browser checks passed again after strengthening the pending-clip persistence/save case. Production React commit counts and real-device behavior remain unmeasured. See `performance/pray-mission-2-report.md`. No list virtualization, storage schema or server protocol change was made.

### Mission 3 — Implement batches of ten with bounded rendering

Status: [x] Complete  
Dependency: Mission 2.

Evidence: [Mission 3 report](../performance/pray-mission-3-report.md). Production build passed; 126/126 combined checks passed. Full traversal reached 2,000 unique prayers with at most 16 mounted cards in the browser fixture. Physical-device profiling remains outstanding.

- Initially expose ten prayers for each list/filter. Reveal the next ten near the end, with a keyboard-accessible “Load 10 more” fallback and a clear end state. Avoid artificial delays/spinners for already-cached data.
- Replace the retain-forever list with measured variable-height windowing and a small viewport buffer. Retain data, not old card trees.
- Keep loading progress and scroll anchors per Journal/Circle filter. Restore by item ID and offset; handle deletion, incoming items, rotation, keyboard resize, and text expansion.
- Keep active playback independent of virtual rows; clean up inactive waveform resources after leaving the buffer. Preserve a focused editor safely without unbounded pinned rows.
- Resolve notification targets against the full collection, expose the necessary range directly, navigate through the virtualizer, and show the expanded target when its row mounts. Do not force users to load intervening batches manually.
- Preserve unread counts over the full collection and the existing deferred Circle reorder behavior. A newly saved prayer remains immediately discoverable.
- Measure only active list geometry; inactive/transformed mobile panels must not corrupt virtualizer measurements. Avoid introducing a nested vertical scroll container that fights the page gesture system.

Exit: mounted cards remain bounded after traversing 2,000 items; no skipped/duplicate prayers, lost reply drafts, playback interruption, or broken deep notifications. Verify Arabic/English, long cards, keyboard access and mobile gestures. **Pause and ask to continue.**

### Mission 4 — Release hidden UI and coordinate navigation work

Status: [x] Complete  
Dependencies: Missions 2–3.

Evidence: [Mission 4 report](../performance/pray-mission-4-report.md). Production build and lint passed. Combined checks passed 132/133; the remaining fixture failed during clock setup, was corrected, and its two-test lifecycle suite passed. Pager retention, hidden settings work and navigation-time view publication are now bounded.

- Remove permanent Prayer-page retention after session/audio ownership is proven independent. Keep only the active/neighbor views required by the pager.
- Active-only inner-list mounting and anchor restoration were completed in Mission 3 to prevent hidden-panel measurements. Finish releasing the retained outer page and unnecessary hidden UI here.
- Pause hidden settings polling and UI-only subscriptions/timers. Keep native scheduled backup, pending durable actions and in-progress delivery tasks working.
- Reuse navigation-idle coordination for expensive snapshot-to-view work. Coalesce pending view updates and publish the latest state after the gesture; bound deferral and release correctly on cancel/error/unmount.
- Test privacy-setting debounce and other pending state when unmounting; do not lose the final slider value during quick navigation.

Exit: mounted views/resources return to a stable bound after repeated navigation; swipe gestures have no list rebuilds during finger movement; state restoration remains correct. **Pause and ask to continue.**

### Mission 5 — Make storage updates safer and cheaper

Status: [ ] Implementation complete (5A + 5B); native platform validation remains partial.  
Dependency: baseline evidence; may run before Mission 4 if storage is the dominant measured cost, after updating this plan.

Mission 5A evidence: [report](../performance/pray-mission-5-report.md), build/lint passed, **145/145 checks passed**. Batched repair of 100 entries in a 2,000-prayer fixture reduced index reads/writes/publications from 100 each to 1 each. Warm reads remain cached. Native partial-write fault injection confirms the remaining disk-corruption risk; no native atomicity claim is made.

Mission 5B: user authorized the [native storage compatibility review](pray-native-storage-checkpoint.md) scope by continuing. Bridge, atomic writes, shared backup readers and bounded conflict retries are implemented; see the [report](../performance/pray-mission-5b-report.md). Web and Android builds passed; Android storage/backup tests passed 14/14. iOS source wiring is checked, but iOS compilation and physical-device fault/restart validation remain open. Do not mark full native verification complete until those gates pass. The next user-authorized Mission 6 may proceed with available delivery/restore checks while explicitly carrying these platform gates.

- First distinguish first-run/missing storage from corrupt JSON, unavailable storage, permission failure and I/O errors. Fail closed on mutation after an unreadable index; preserve the existing data and expose a recoverable failure.
- Keep fresh immutable transaction input and publish only after successful persistence. Do not replace disk reads with cached mutation without a proven concurrency design.
- Avoid repeated sorting/reconciliation/publication for the same action. Track changed prayer IDs/recording groups or equivalent reliable revision information; preserve stable references for unaffected cards.
- Batch legacy import/decryption and appropriate received audio metadata commits. Audio bytes must be written before their metadata is committed; all expected text/audio must be durable before acknowledgement.
- Preserve outbox crash recovery, request IDs, expected audio counts, deletion tombstones/cursors, and exact reply matching. No-op operations should not write or cause view notifications.
- Add concurrent web-tab and native-reader scenarios. Evaluate atomic replacement/serialization with the actual adapter before promising crash-safe transactions. Any required cross-runtime storage change must have a concrete compatibility design and its own review checkpoint.

Exit: both adapter suites prove failed reads/writes cannot erase history or publish false success; unchanged reads remain cached; large-history update timings improve against Mission 1. Backup format remains unchanged. **Pause and ask to continue.**

### Mission 6 — Verify delivery, restore, and native compatibility

Status: [x] Available local verification completed; iOS/device and live-service validation remain open.  
Dependencies: Missions 3–5.

Evidence: [Mission 6 report](../performance/pray-mission-6-report.md). Web build/lint passed, Android 15/15, backend mocked checks 31/31, combined frontend 164/165 with a separately corrected/rechecked trusted-touch timing test. Actual Android archive imported and round-tripped through JavaScript; iOS STORE fixture is synthetic only. Fixed silent missing-audio omission in web backup/restore. No live-service or physical-device compatibility claim.

- Exercise two independent clients: send text/audio, anonymous share, offline send/restart/retry, lost response, receive duplicate bundle, reply, sender update, and acknowledgement failure.
- Test deletion during delivery/reply/restore; revoked prayers must never reappear.
- Exercise notifications for old items outside the first ten and for replies arriving after the notification.
- Round-trip JavaScript, Android, and iOS archive fixtures through the shared importer; include old IDs, read receipts, queued actions, tombstones, multiple clips and missing audio.
- Verify backup still includes the entire persisted history when only ten prayers are displayed, and native background backup continues after leaving Pray.
- Treat synchronous web ZIP work and the unbounded transport inbox as separate measured costs. If they materially block the target scenarios, specify a focused follow-up mission (worker-based ZIP or delivery pagination with acknowledgement-safe cursors) before implementing protocol changes.

Exit: results distinguish unit mocks, browser integration, backend integration, native builds and real-device checks. No untested platform is described as verified. **Pause and ask to continue.**

### Proposed Missions 6A / 6B — Bound remaining transfer work

Status: [x] 6A implemented and locally verified. [ ] 6B awaits user continuation.

See the [focused follow-up plan](pray-transfer-follow-up-plan.md). At 2,000 synthetic entries, isolated desktop Chromium backup/restore work delayed a timer by 106/100.4 ms and inbox merge by 51.3 ms. These are diagnostic timings, not mobile measurements.

- **6A:** complete locally: worker-based web ZIP/manifest processing, compatibility/failure/cancellation tests and cooperative restore transactions. [Report](../performance/pray-mission-6a-report.md): build/lint passed, 173/173 combined checks and final targeted restore recheck; Chromium/WebKit actual-worker diagnostics passed. Device validation remains open.
- **6B:** backward-compatible bounded inbox transport/ingestion, stable cursors and acknowledgement-safe retries; review the protocol before implementing. Pause afterward.

Recommend these before Mission 7's final comparison. Carry native-device/iOS/live-service gates forward separately.

### Mission 7 — Final performance comparison and cleanup

Status: [ ] Not started  
Dependencies: Missions 1–6.

- Repeat the identical production baseline scenarios; report before/after frame distributions, long tasks, DOM/player counts and storage work.
- Aim for the device's frame budget (approximately 16.7 ms at 60 Hz); report p95/p99 and missed frames rather than claiming smoothness from an average. Investigate prayer-induced tasks over 50 ms during interaction.
- Require card/player counts to plateau with repeated scrolling and navigation, rather than grow with total items visited. Record the actual viewport buffer/active-player exception bounds.
- Verify visible anchor stability, no unexplained jump to top, immediate local save feedback and no blank list on return.
- Remove obsolete retain-forever paths and verified-unused styles/imports; correct stale storage/sharing comments. Keep abstractions small and tied to actual responsibilities.
- Run appropriate final browser/backend/native checks and production build. Record unavailable checks and any remaining issues.

Exit: measured improvement and functional evidence are documented, with independent rollback boundaries for UI and storage changes. **Pause for user review; do not deploy automatically.**

## Regression matrix

| Area | Required cases |
| --- | --- |
| Storage | Empty/new store; existing history; failed read/write; corrupt native JSON; warm reads; external invalidation; stale async read; concurrent writes |
| Composer | General/section text; voice-only; record/pause/resume/cancel; save during delayed storage; privacy preference; navigation and account switch |
| Lists | 0/1/10/11/500/2,000 items; very long cards; filters; reverse scrolling; focus; RTL; resize; delayed avatars/audio |
| Playback | Scroll offscreen; switch inner/app tabs; reorder/update; second clip pauses first; resource cleanup; missing file |
| Sharing | Offline/restart; slow/lost responses; same request ID on retry; anonymity; multiple shares to same recipient; no acknowledgement before complete persistence |
| Read state | Viewport visibility; inactive tabs; unseen incoming reply; stale seen operation; restore history does not become new activity |
| Deletion | First-minute expiry; failed request; late delivery/reply; restore old backup; exact share removal |
| Notifications | Deep local target; unknown target; delayed payload; targeted reply; stale/deleted target |
| Backup | Entire history; native schedule/account marker; cross-platform ZIP fixtures; duplicate restore; no automatic resend; foreground/background overlap |
| Navigation | Swipe commit/cancel; long-list scroll position; keyboard open; repeated page visits; updates arriving mid-gesture |

## Existing verification and source inventory

Review-only verification on 16 November 2026: **47/47 unit tests passed** using:

```powershell
node --test tests/prayer-cache.test.cjs tests/prayer-activity.test.cjs tests/prayer-sync.test.cjs tests/prayer-backup.test.cjs tests/prayer-notification-navigation.test.cjs
```

This run does not establish a production performance baseline, browser integration result, backend integration result, or native-device result.

Reviewed source boundaries:

- `src/app/pray/page.jsx`: composer, card variants, picker, profile/friends reads, local import/repair, inbox/replies, notifications, settings integration.
- `src/app/pray/PrayRecordings.jsx`: microphone, waveform/playback, saved clips, Drive actions and native backup settings/status.
- `src/app/pray/RetainedPrayerList.jsx`, `usePrayerCircleOrder.js`, `usePrayerDeleteWindow.js`, `prayerCircleText.js`, `BackupFrequency.jsx`, `PrayerBackup.module.css`.
- `src/app/utils/prayRecordings.js`, `prayerActivity.js`, `prayerNotificationNavigation.js`, `googleDriveClient.js`, `tabRequests.js`, `sessionTasks.js`, `navigationWork.js`.
- `src/app/services/prayerSync.js`, `prayerBackupService.js`, and the two prayer lifecycle components.
- `src/app/components/PrimaryTabPager.jsx` and mobile panel CSS/gesture integration.
- `../backend/Routes/Users-Router.js`, prayer handlers in `Controlls/Users-api.js`, `models/model-SharedPrayTransit.js`, `models/model-SharedPrayDeletion.js`.
- Android `PrayerBackupArchive.java`, `PrayerBackupPlugin.java`, `PrayerBackupWorker.java`; iOS `PrayerBackupArchive.swift` and backup plugin/engine integration.
- Existing prayer test cases and installed virtualizer API declarations.

Reuse `tests/prayer-notification-opening.browser.cjs`, `tests/primary-tab-swipe.browser.cjs`, backend prayer idempotency/revocation/push suites and native archive tests. Tests asserting permanent DOM identity must be revised to assert preserved user state and bounded resources; retain their behavioral coverage.

## Execution log

| Date | Mission | Status | Evidence / next checkpoint |
| --- | --- | --- | --- |
| 2026-11-16 | Review and plan | Complete | Read storage/delivery/UI/backup paths; 47 unit tests passed; application code unchanged. Await user continuation for Mission 1. |
| 2026-11-16 | Mission 1 | Complete with documented environment gaps | Production build passed; frontend combined checks 99/109 passed, with 9 obsolete backup-selector failures and 1 swipe timeout that passed alone; backend mocked checks 29/29 passed. Synthetic production baseline covers 10/100/500/2,000 items. Await user continuation for Mission 2. |
| 2026-11-16 | Mission 2 | Complete | Production build and 120 combined checks passed; three strengthened unmount checks passed. Updated obsolete backup menu tests. Draft/mic/playback ownership now survives Pray view teardown. Await user continuation for Mission 3. |
| 2026-11-16 | Mission 3 | Complete | Batches of 10, bounded measured rows, per-filter anchors, focus and playback preservation, deep target navigation. Build and 126/126 combined checks passed; maximum 16 mounted cards while reaching all 2,000 prayers. Await user continuation for Mission 4. |
| 2026-11-17 | Mission 4 | Complete | Active/neighbor pager bound, hidden UI teardown, deferred/coalesced view state, gesture deadlines. Build/lint passed; 132/133 combined checks plus corrected lifecycle suite 2/2. Await user continuation for Mission 5. |
| 2026-11-17 | Mission 5A | Complete; Mission 5B pending review | Fail-closed reads, Web Locks, batched imports/repairs/audio, retry UI. Build/lint and 145/145 checks passed. Native partial-write recovery requires the documented 5B compatibility checkpoint; Mission 6 not started. |
| 2026-11-17 | Mission 5B | Implemented; platform validation partial | Atomic native bridge, shared backup readers and bounded conflict retries. Web/Android builds and lint passed; 158/158 combined checks and 14/14 Android tests passed. iOS build and physical-device fault/restart tests remain open. Paused for user continuation before Mission 6. |
| 2026-11-17 | Mission 6 | Available local verification complete; platform/service gaps open | Fixed incomplete web archives; two-client delivery/restore tests; actual Android archive import. Build/lint passed; Android 15/15, backend mocks 31/31, frontend 164/165 plus corrected swipe suite 22/22. Measured ZIP/inbox stalls; proposed 6A/6B follow-ups. Await user continuation for recommended Mission 6A. |
| 2026-11-17 | Mission 6A | Implemented; desktop verification complete | Archive worker, transferred buffers, bounded lifetime/cancellation, yielded restore phases. Build/lint and 173/173 regression checks passed; final scheduling refinement rechecked in production backup/restore scenarios. Final diagnostic timer gaps under 50 ms for tested text/audio cases; real devices remain open. Paused before Mission 6B. |
