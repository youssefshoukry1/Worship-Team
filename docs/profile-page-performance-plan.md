# Profile page performance implementation plan

**Status — Steps 1 through 7 and the A24 rendering follow-up are complete locally. Production rollout pending.**

## Intended experience

Opening My Profile shows the cached header, social notes, AI usage section and settings rows. The Bible settings rows show accurate record counts. Opening Bible Notes loads its first 10 grouped records. Opening Highlights loads its own first 10. Approaching the end loads the next page. Returning by back or swipe restores the previous view and reading position. Shared profile notes retain their existing 12-note pages and offline behavior.

## Findings from the code review

| Area | Current behavior | Work |
| --- | --- | --- |
| Private profile | The owner endpoint reads a broad user document, including Bible arrays and legacy prayers. The shared client cache sorts collections and stores the combined result. Pray, Bible and Hymns also consume this cache. | Steps 1–3 |
| Menu and settings | Profile groups both Bible arrays to show counts. The selected setting renders every group. Grouping can combine multiple verses into one displayed record. | Steps 2–5 |
| Hidden and returning Profile | Mounting the owner view can start the full read during neighboring-tab preparation. Window focus can force a refresh. Profile also reads the local prayer index for an unused count. | Step 3 |
| Horizontal social notes | Bodies already load in batches of 12. The owner's metadata list can cover the entire history when the collection changes. Previously loaded bodies can be restored together, and the rail mounts every loaded card. | Step 6 |

Reference the [Profile page](../src/app/normal_UserProfile/page.jsx), [shared profile cache](../src/app/utils/profileCache.js), [current grouping rules](../src/app/utils/bibleProfileGroups.js), [owner profile API](../../backend/Controlls/Users-api.js), [social profile API](../../backend/Controlls/Testimonies-api.js) and [social notes store](../src/app/components/testimonies/profileNotesStore.js).

## Step 1 — Measure the current behavior and map dependencies

- Use isolated fixtures on desktop and the Galaxy A24 WebView. Include an empty profile, a typical account and a long history with at least 1,000 Bible entries and 120 previously opened social notes. Include multi-verse groups, identical timestamps and legacy entries.
- Measure neighboring-tab preparation, first Profile open, warm return, window focus, each Bible setting, load-more, and offline restart. Record request initiators, payload bytes, local storage reads, grouped records, mounted cards, first visible content and scroll frame gaps. Repeat timed scenarios at least five times and report the median and range.
- Identify the fields used by the menu, Pray, Bible reader, Hymns, user context and visitor profiles. Trace every Bible edit/delete and offline replay that can affect a displayed count. Establish whether either Bible collection is already fetched elsewhere before Profile opens.

**Acceptance:** Save the baseline and consumer map. Identify which work Profile starts and which work belongs to another screen. No product behavior changes in this step.

### Step 1 measurements, November 26, 2026

Five trials per size and platform used the production export on desktop Chrome and the installed Galaxy A24 WebView. Each trial started on an isolated synthetic origin. Sizes are raw entries **per Bible collection**. The typical and long fixtures include paired verses with matching timestamps and one legacy entry lacking a date. The long fixture has 120 social notes. Reading all pages through More populates the real owner cache before the offline restart. The harness restores the original phone URL. [Reproduction script](../scripts/measure-profile-page.cjs) · [A24 raw trials](../performance/profile-step1-a24-webview.json) · [Desktop raw trials](../performance/profile-step1-desktop.json)

| Platform and entries per collection | Menu ready | Warm return | Offline restart | Open Highlights | Open Notes |
| --- | ---: | ---: | ---: | ---: | ---: |
| A24, empty | 942 (885–1,148) | 395 (318–405) | 936 (923–994) | 118 (107–125) | 126 (103–146) |
| A24, 24 | 1,037 (964–1,069) | 442 (392–452) | 958 (919–1,013) | 199 (146–223) | 148 (54–210) |
| A24, 1,000 | 1,025 (959–1,117) | 601 (584–621) | 1,174 (1,132–1,204) | 661 (643–742) | 736 (694–823) |
| Desktop, empty | 504 (298–616) | 103 (54–131) | 554 (447–621) | 51 (28–75) | 55 (41–131) |
| Desktop, 24 | 542 (478–575) | 104 (101–120) | 575 (573–625) | 65 (47–83) | 56 (43–59) |
| Desktop, 1,000 | 403 (374–536) | 86 (84–96) | 535 (513–599) | 166 (133–381) | 187 (166–203) |

Values are median milliseconds (minimum–maximum). Menu readiness uses the visible Highlights row with a numeric count. Settings timings measure from button activation through the view change and a sampled animation frame. Warm return uses bottom navigation from Friends. Offline restart reloads the document with application API requests blocked and local assets available. Harness waits and device-control overhead are included. Native storage bridges, live server latency, HTTP compression and Android process launch were outside this test. Compare like-for-like trials rather than attributing the entire menu time to Bible records.

- **Broad reads.** Across all five long trials on each platform, the initial open, a window-focus event and an independent fresh Friends visit that prepared the neighboring Profile each requested the full private profile. Each response contained 580,702 uncompressed fixture bytes. The warm tab return made zero additional private-profile requests. Opening either Bible setting required no Bible detail request because both arrays had already arrived. One shape with both note and color fields was used for the simulated entries, so the bytes are a reproducible workload rather than a production traffic estimate.
- **Bible DOM.** Each collection produced 0, 13 or 501 display groups. Opening the long setting mounted all 501 cards. In the short programmatic scroll probe on the A24, the largest sampled frame gap in each long-list trial was about 33 ms. The largest measured cost was opening the setting. This probe covers 12 animation frames and does not characterize sustained finger scrolling.
- **Social history.** Both platforms initially mounted 12 of 120 social cards, made nine further requests for 12 bodies each, then mounted all 120. The offline restart restored all 120 to the DOM. The long first social response was 14,055 fixture bytes including the complete metadata list. Detail paging already exists here.
- **Read attribution.** In the long fixture, IndexedDB recorded a prayer-index read on Profile and a prayer-index read in the independent Friends-preview document. The owner component explicitly calls `getGuestPrays()` for an unused count. The raw logs also contain global directory, avatar, Bible and feed store reads. Those counters are document-wide and do not imply that Profile initiated every read. Billing status is fetched by the AI usage component when active and can be requested again when the menu remounts.

### Consumer and mutation map for Steps 2–5

| Entry point | Data dependency or write behavior to preserve |
| --- | --- |
| Owner menu and Profile settings | Header and editing use ID, name, username, photo and roles. Friend statistics, publishing and access are supplied by the social profile. AI quota uses billing status. The two Bible counts currently depend on grouping complete private arrays. |
| Bible reader and presentation | Opening the active reader can request the shared full profile for highlights before Profile is ever visited. Active reader/presentation also reads team-scoped Bible and hymn notes via `my-notes`. AI study uses a cached profile name. Scope annotation cache keys appropriately. |
| Pray and Hymns | Pray consumes cached identity and server prayer history for legacy repair. Hymns reads the same cache when its prayer modal opens and can write the combined snapshot. Replacing the shared cache with a summary under the same key could discard those fields. |
| User context, billing and direct callers | Photo changes update the cached user. Billing changes invalidate the existing cache. Username recovery, programmer access, chat sender display, chat backup Drive linking and Teams approval polling also call the existing profile endpoint directly. Introduce a separate summary contract. |
| Visitor Profile and social notes | Visitors use the social-profile endpoint and its access checks. The owner's permanent social-note cache is viewer-scoped. Keep visitor data, owner Bible details and the expiring Friends feed separate. |
| Bible and Workspace writes | Reader note saves update local verse notes, post to the API and can enqueue offline saves. Workspace can post or enqueue a Bible note too. Reader highlight toggles write the local map then post/delete per verse. The reader handler logs a failed network write without explicitly queueing it. Reconcile pending changes before overwriting local state. |
| Profile writes and replay | Profile edits and deletes grouped notes per verse/note ID. Highlight deletion accepts grouped verse IDs. Network failures can enqueue work. The note edit/delete paths currently use `fetch` without checking every HTTP response before updating local state. Queue replay exists in the client and service worker. Test partial failures, rejected writes, replay and count invalidation from either path. |
| Server scope and grouping | The current private profile exposes the owner's full arrays. The separate reader note endpoint filters by active team. Mutations match team-specific records. Preserve those distinctions. A display group uses book, chapter, exact note or color and a strict window under 60 seconds anchored to the first entry. Test missing dates and IDs against current output. |

All 17 focused grouping, profile-note store and profile-note storage checks passed. Step 2 should start with an owner-only summary and grouping parity tests before introducing the page cursor. No application or backend implementation changed in Step 1.

## Step 2 — Design and implement the owner summary and grouped Bible API

- Add an authenticated owner summary with the fields the menu actually uses and the two grouped counts. Exclude Bible entry bodies and legacy prayer history from this response. Keep private annotations out of visitor responses.
- Provide separate authenticated cursor reads for Notes and Highlights. Default to 10 **complete display groups** with stable ordering and a continuation cursor. Use the current grouping code and its tests as the reference for book, chapter, note text or highlight color, time windows, verse order and legacy dates.
- Inspect database execution against the long fixture. The current records live in arrays on the user document. A limit applied after reading and sorting the entire history still leaves a database bottleneck. Choose the least complex representation that supports cheap menu counts and bounded page reads. If stored groups or counters are needed, document the index, backfill, parity check and rollback before switching reads.
- Define how cursors behave when an edit merges or splits groups, or when a deletion removes the current anchor. Preserve the existing account and team visibility rules for each consumer.

**Acceptance:** Comparing every returned page with the current grouped output yields identical records and counts on the reference fixtures. No split cards, duplicates or omissions on unchanged data. Verify that menu payload size stays independent of Bible history and inspect database work for first and deep pages.

### Step 2 contract and verification

- **Summary:** authenticated `GET /api/users/profile-summary` returns `user` with available identity fields (`_id`, `Name`, `username`, `profilePhoto`, `role`, `global_role`) and `counts: { notes, highlights }`. The authenticated account determines ownership. Bible text, social content and prayer history are excluded. The user lookup projects these fields and two stored counters. MongoDB can still fetch the underlying owner document, but the API process does not read or group its arrays for an initialized summary.
- **Pages:** authenticated `GET /api/users/profile-bible/notes` and `/api/users/profile-bible/highlights` return `{ items, total, version, nextCursor }`. The default and maximum page size is 10 full groups. Supply `?cursor=…` for the next page. A cursor from another owner or collection returns 400. After an edit changes that collection, an old cursor returns 409. The client should refresh page one and restore its anchor by group/verse identity. The other collection's cursor remains valid.
- **Storage and write cost:** the embedded annotation arrays remain authoritative. A separate collection stores complete groups with a unique index on `(owner, kind, position descending)`. Positions start at the oldest end. Annotation mutations, changed group rows and stored counts commit in one transaction. A fingerprint comparison avoids rewriting unchanged groups. An edit still scans the affected kind's raw entries and stored fingerprints. This trades write-time work and additional storage for bounded detail reads. Measure high-volume edits before rollout. Account deletion removes the derived rows.
- **Scope:** owner views include the owner's records across teams, as the previous private Profile did. Annotation mutations retain their church/team match. The schema now explicitly persists the supplied church ID on new Bible entries. Backfill preserves stored legacy records, including entries without a team, missing IDs and missing dates. The team-scoped reader endpoint and visitor social endpoint continue to have their own contracts.
- **Evidence:** a disposable MongoDB replica set exercised both collections with 1,000 entries each. All pages matched the frontend reference output, including equal timestamps, multi-verse grouping and legacy entries. The fixture summary was 98 bytes with its minimal identity. On initialized first and deep page queries, MongoDB examined exactly 10 index keys and 10 group documents to return 10 groups, in addition to the owner metadata lookup. Checks covered concurrent adds, a split on edit, deletion, wrong-team deletion, stale and cross-account cursors, transaction rollback and account cleanup. The focused backend suites passed 10 tests and the existing frontend grouping suite passed five. No client change or production deployment was made.

### Rollout and rollback

1. Use a transaction-capable MongoDB deployment. Deploy the new annotation writers to **all** backend instances before backfill. Keep the frontend on the existing contract during this phase.
2. In the target backend environment run `node scripts/backfill-profile-bible.cjs`. It creates the compound index and processes accounts missing either revision in individual transactions. It can resume after interruption. A missed account can also initialize on first API access. Prefer completing backfill first to avoid that first-read cost.
3. Sample accounts with short, long and legacy histories. Compare counts and paged output against the frontend grouping reference, inspect the query plan and monitor annotation write latency. Then enable the new menu and settings clients in their respective later steps.
4. To roll back the client, use the existing private profile endpoint. Original annotation data stays in place. If older backend writers run again, keep the new reads disabled until all writers are upgraded and `node scripts/backfill-profile-bible.cjs --rebuild` has reconciled every account. No production backfill or rollback was executed during Step 2.

## Step 3 — Make the Profile menu lightweight

- Give the menu an account-scoped summary cache. Render its last valid snapshot immediately. Start network revalidation only when the view is active and the summary is stale or invalidated. Coalesce concurrent reads and ignore late results after account changes.
- Remove menu-time Bible grouping and the unused local prayer-count read. Preserve the header and AI usage layout while fresh values arrive. A missing count should have a stable placeholder until it is known.
- Separate the menu cache from the existing full-profile cache. Migrate any caller identified in Step 1 that would otherwise fetch full Bible history solely to prepare Profile. Preserve Bible reader annotations, Pray history repair and Hymns behavior through their own entry points. Reuse existing offline data without expanding it all on each menu visit.

**Acceptance:** A Profile preview and a menu-only visit trigger zero Bible collection requests, zero full-history grouping and zero Profile-initiated prayer-index reads. A fresh return performs no redundant summary request. Counts remain visible offline after a successful prior sync.

### Step 3 results

The owner menu persists a small header and grouped counts under an account-specific key. A fresh snapshot renders synchronously. Active reads share the existing 15-second request cache. Tab activation, window focus and reconnect recheck freshness. The existing profile invalidation also expires the summary. During an offline upgrade, a user with only the legacy cache can recover the header. Counts display a dash until the first successful summary sync. The existing details loader runs only inside Notes or Highlights pending Step 4.

In [15 desktop Chrome fixture trials](../performance/profile-step3-desktop.json), each initial menu visit fetched one summary and zero full profiles. The long fixture returned 127 uncompressed summary bytes versus 580,702 bytes for the baseline full profile. Each hidden preview, fresh focus and warm return made zero summary or full-profile requests. All offline restarts showed numeric counts. The menu no longer calls the prayer store. Document-wide storage instrumentation still records a prayer-store read elsewhere. Seventeen existing grouping and social-note tests passed.

These trials used a local webpack export with type checking skipped for the fixture. The standard build hit a Cinzel Google Font resolution error under Turbopack, and webpack type checking stopped at the existing Metronome route prop signature. Production build verification and an updated A24 measurement remain outstanding. Release the Step 2 backend and indexes before shipping this client.

## Step 4 — Load Bible Notes and Highlights on demand

- Mount the selected collection loader when its setting opens, including direct entry and restored settings navigation. Request only the selected kind. Fetch one next page near the end, and provide an accessible Load more action. Deduplicate rapid triggers and cancel or ignore stale responses.
- Cache loaded pages and scroll anchors separately by account, collection and applicable scope. Render cached pages immediately on return. Preserve vertical/continuous display, Arabic and RTL text, multi-verse cards, and back/swipe restoration.
- Distinguish first load, empty results, offline cached results, end of list and a failed next page. A next-page retry should leave earlier records in place. Measure mounted rows after extended scrolling and bound the rendered window if accumulated groups exceed the frame budget established in Step 1.

**Acceptance:** Opening Notes with a cold cache requests only 10 note groups and no highlights. Verify the inverse for Highlights, then page through both collections. Switching settings during a delayed request must never put records in the wrong list. Returning to a fresh cached page restores its anchor without a full refetch.

### Step 4 results

Each setting requests its own 10-group page on entry. Scrolling down near the footer or activating Load 10 more advances its cursor. IndexedDB stores individual pages by backend, owner, kind and page position. A cached continuation must match both its cursor and collection version. A stale server cursor restarts at page one. Cached pages stay readable after a network failure. During an offline upgrade, the selected setting can recover groups from the older local profile snapshot. The menu uses the separate summary.

The settings list uses React Virtuoso with document scrolling. Within the mounted Profile session, each collection retains its measured row sizes and scroll position independently. A cold restart recovers previously cached pages on demand starting at the first page. The list cancels pending work when the setting closes.

[Desktop measurements](../performance/profile-step4-desktop.json) cover 15 fixture trials. In the five long trials, settings initially mounted 4 to 6 cards for a 501-group collection. Separate Chrome checks on the final fixture build opened each setting directly, paged through 80 groups in each direction, retried a failed next page, restored the last card on a fresh return, reopened cached content offline and switched settings during a delayed request. At the bottom there were 7 mounted note cards and 6 mounted highlight cards. Seventeen existing frontend checks and the backend paging integration suite passed. The browser fixture used the local webpack test build described in Step 3. Device timing and the production release build remain unverified.

## Step 5 — Keep counts, edits and offline changes consistent

- Connect add, edit and delete actions in Profile and the Bible reader to the affected summary and collection pages. A multi-verse change may split, merge or remove a group. Use an authoritative grouped count after reconciliation.
- Carry existing offline edits into the new cache flow. Keep them visible through navigation and restart. Preserve pending mutations during stale refreshes, handle replay once, and reconcile affected pages on reconnect. Avoid refreshing unrelated collections.

**Acceptance:** Verify an edit that splits a group, a deletion that removes its last verse, and an offline mutation followed by restart and reconnect. Check summary counts, page boundaries and the reader's annotations after each. Switching accounts must never expose another user's records.

### Step 5 results

Profile, the Bible reader and Workspace now persist each annotation gesture as one ordered IndexedDB change. The foreground app and service worker share replay logic. Each authenticated batch updates one collection and its group index in a transaction. A per-device sequence checkpoint makes repeat delivery safe after a lost response. The response contains the authoritative grouped count and version. Reader maps are scoped by account and team. Profile pages still cover the owner across teams.

Cached cards show pending edits on reopen. The menu reads small count metadata and displays an ellipsis for a collection awaiting confirmation, since an offline edit can merge with records on an unloaded page. A confirmed change revalidates the affected setting. Successfully persisted current pages allow confirmed journal entries to be retired. The worker also notifies open clients when it replays annotation requests left in the original queue.

**Verification.** A MongoDB replica-set test covered group split, merge, deletion of the final verse, invalid batches, account isolation and retrying an old sequence after deletion. A Chrome IndexedDB test covered offline restart, concurrent foreground drains, rejection, account isolation and acknowledgement cleanup. In the exported Profile UI with an isolated API fixture, a queued edit stayed visible after a reload, reconnect delivered one POST, and deletion produced a menu count of zero with no Highlights request. The mobile-width test also exposed the navigation bar intercepting Update Note; the edit sheet now sits above it. Eighteen focused frontend tests and the backend paging integration suite passed.

**Release order.** Deploy the backend batch endpoint to all instances, run the existing backfill with `--rebuild` to populate per-verse team and date metadata in previously indexed groups, then ship the client and service worker together. Tests used the local webpack fixture build documented in Step 3. Production deployment, actual Android background sync scheduling and iOS device verification remain outstanding.

## Step 6 — Bound social profile note work while keeping offline access

- Retain the 12-note page size. Decouple bodies saved on the device from cards mounted in the horizontal rail. Preserve its horizontal anchor, keyboard focus, note opening, reactions, editing and deletion.
- Restore the first visible page and its neighbors from cache on demand. Keep previously saved bodies available offline. Use the current version check for unchanged collections. Measure the full metadata response on a change and replace that unbounded path with paged changes or paged reconciliation, including deletion and access-revocation handling.
- Preserve owner versus visitor cache rules and the separate 24-hour Friends feed. A note disappearing from the visible rail must never be interpreted as deletion from storage.

**Acceptance:** With 120 saved notes, reopening Profile mounts only the visible range plus a small measured buffer. Older saved notes remain reachable offline. A single change does not require downloading the whole metadata history in the normal sync path. Verify revoked access, an offline return, and a reaction notification targeting an older note.

### Step 6 results

Profile requests social notes in pages of 12. The horizontal rail mounts the visible cards plus a two-card buffer on either side and can retain a focused card. It remembers the leading note and horizontal offset for each profile during navigation. The owner's device cache stores the first 12 bodies with the profile header and keeps older bodies individually by note ID and content revision. More reads saved bodies before making a network request. A reaction notification can open a saved older body directly. A legacy combined cache migrates on first use. Visitor bodies stay in session memory, and the Friends feed continues to use its own expiry and access rules.

The backend keeps the latest 32 create, edit and delete events on the owner, committed in the same transaction as the collection version. Updated clients ask for cursor pages on first open. On a version mismatch they receive changed IDs and current metadata for surviving notes. A gap outside the retained history uses reconciliation pages of at most 50 metadata records. A windowed-out card is never a deletion signal. Existing clients can still request their previous profile response.

**Verification.** In [desktop Chrome fixture trials](../performance/profile-step6-desktop.json) at a 390-pixel viewport, reopening a 120-note archive mounted 6 cards compared with 120 in Step 1. The offline tests opened an older note from a notification and paged to the oldest saved card. A separate keyboard test crossed 17 cards, restored focus after dismissing the reader and restored a 1,504-pixel rail offset after visiting Highlights. In the isolated MongoDB integration test, a single edit produced 579 uncompressed JSON bytes versus 19,978 bytes for the previous owner response. Tests covered deletion, access revocation, cache migration and three-page metadata repair. All 14 focused frontend and 34 backend tests passed.

Deploy the backend before enabling the new client. The rolling change history starts with the first upgraded write. The local browser trials used the webpack fixture export described in Step 3. Device measurement and the final report are Step 7.

## Step 7 — Validate on the phone and document the result

- Repeat the Step 1 scenarios on the same Galaxy A24 and compare bytes, request counts, storage work, mounted cards, first visible content and frame gaps. Report any regression alongside improvements.
- Run focused frontend and backend checks for grouping, pagination, cache migration, offline mutations, account switching, visitor privacy, Pray/Bible/Hymns dependencies, swipe navigation and notification opening.
- Add the verified architecture and results to `public/reports_informations/profile-performance.md`. Document endpoint ownership, grouping and cursor rules, cache keys, invalidation, offline recovery and release order. Deploy backend support and verify any required indexes or backfill before enabling the client through OTA.

**Completion criteria:** Profile opens without fetching private Bible collections. Each setting starts with at most 10 complete groups. Offline data and return position survive navigation. The social rail's mounted card count stays bounded as saved history grows. Record measured results before making a speed claim.

### Step 7 results

Five trials per history size on each platform used isolated fixture origins in the production-mode webpack export. Timings below are median milliseconds (minimum–maximum). See [Galaxy A24 trials](../performance/profile-step7-a24-webview.json), [desktop trials](../performance/profile-step7-desktop.json) and the [maintenance report](../public/reports_informations/profile-performance.md). Step 1 contains the corresponding baselines and timing definitions.

| Device and entries per collection | Menu count visible | Warm return | Offline restart | Highlights | Notes |
| --- | --- | --- | --- | --- | --- |
| A24, 0 | 1046 (908–1277) | 406 (343–464) | 969 (829–1015) | 136 (97–150) | 128 (113–136) |
| A24, 24 | 1059 (977–1117) | 476 (421–510) | 1014 (954–1094) | 197 (192–204) | 179 (173–221) |
| A24, 1000 | 1112 (1046–1150) | 470 (414–501) | 998 (967–1038) | 208 (204–225) | 185 (153–230) |
| Desktop, 0 | 300 (283–388) | 64 (55–81) | 437 (424–486) | 37 (28–45) | 27 (22–106) |
| Desktop, 24 | 302 (300–344) | 63 (62–69) | 446 (431–453) | 40 (40–128) | 61 (33–65) |
| Desktop, 1000 | 349 (277–386) | 72 (60–97) | 471 (445–590) | 55 (48–64) | 63 (42–78) |

On the A24 long history, warm return saved 131 ms and offline restart saved 176 ms. Initial menu readiness regressed by 87 ms. Both settings opened faster, but the median worst frame in the 12-frame scroll probe increased from 33 to 83 ms. Desktop long-history scroll probes remained near 17 ms. The physical WebView used local fixture assets and simulated API responses. Confirm the phone regressions with a rendering trace before OTA. Inspect per-scroll anchor snapshots, footer geometry reads and virtual card measurement. The probe does not identify which one caused the regression.

All 104 focused frontend checks, 35 backend checks and seven focused browser scenarios passed. Browser coverage included cached Profile return, account switching, settings Back in Chromium and WebKit, and online/offline notification opening. Updated test fixtures for the owner summary and existing Hymns socket transport order. Production build verification, database rollout and physical iOS testing remain outstanding.

### Rendering follow-up

The [five-run A24 comparison](../performance/profile-render-comparison-a24.json) records the directly observed count and each setting's short scroll probe. Rendering ten ordinary cards on the first page avoids virtual row churn. The full list switches to windowed rendering on the second page. Starting the actual Profile entry and its authenticated owner summary earlier moved median count availability from 761 to 658 ms. In these paired workloads, median worst frame gaps fell from 83 to 17 ms in Highlights and from 67 to 17 ms in Notes. The [maintenance report](../public/reports_informations/profile-performance.md) documents the measurements, limitations and loading rules.

The separate final matrix covered 15 [A24 WebView](../performance/profile-render-a24-webview.json) and 15 [desktop](../performance/profile-render-desktop.json) trials. The A24 long-history median count marker was 723 ms in this run. The long-history scroll gap remained 17 ms in both settings. Every first menu made one owner-summary request and every independent Friends preview made zero private Profile requests. Chromium checks crossed the first-page boundary and returned to record 80 in both settings. The production-mode fixture export used the existing type-check workaround. No APK, OTA or backend deployment was performed.
