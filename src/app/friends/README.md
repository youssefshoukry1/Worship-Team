> Current friend directory and request architecture: [Friends system report](../../../public/reports_informations/friends-system.md). Own-friend search now uses the local directory; online discovery and other users' friend lists remain server-paginated. This supersedes older own-friend API search descriptions below.

# Friends notes: implementation guide

Updated: 17 November 2026. Read this before changing notes on Friends or the shared Profile note components.

## Ownership and entry points

`page.jsx` owns Friends search, Requests / My Friends / Sent, mutual-friend suggestions, and the activity section. Notes are rendered by `../components/testimonies/TestimonyBoard.jsx`; do not add a second feed fetch or cache in this page.

`TestimonyFeedProvider.jsx` owns one authenticated session's feed, owner reaction lists, and Profile notes stores. It survives tab navigation. Changing accounts/tokens creates a new session. Components subscribe to shared stores instead of fetching the same feed on every mount.

| File in `../components/testimonies/` | Responsibility |
| --- | --- |
| `testimonyFeedStore.js` | Friends feed, pagination, live changes, seen state, expiry, offline restore and reconciliation |
| `feedNotesStorage.js` | New account-scoped persistent Friends note bodies |
| `TestimonyBoard.jsx` | Cards, composer/reader selection, paging and retry UI |
| `TestimonyCard.jsx`, `noteTime.js` | Card presentation, unread pin, relative/date labels |
| `TestimonyComposer.jsx`, `noteContent.js` | Writing, character limit, publication and editing |
| `TestimonyReader.jsx`, `NoteActionsMenu.jsx` | Expanded note, owner menu, delete confirmation |
| `NoteLove.jsx`, `noteLoveQueue.js` | Optimistic love/unlove and request ordering |
| `OwnerNoteLoves.jsx`, `NoteReactors.jsx`, `noteReactorsStore.js` | Owner's avatar preview and paged Loved by list |
| `useNoteSheetOpen.js`, `useNoteSheetDrag.js` | Finger-following reaction sheet gestures |
| `useNoteEditWindow.js` | Five-minute editing window |
| `profileNotesStore.js`, `profileNotesStorage.js` | Separate permanent Profile collection and owner offline archive |
| `testimonyApi.js`, `testimonies.module.css` | Authenticated requests/events and shared presentation |

## Feed and server contract

The server is authoritative for access, publishing eligibility, content, reactions and expiry. Backend implementation: `backend/Controlls/Testimonies-api.js`, `backend/models/model-Testimony.js`, and testimony utilities under `backend/Utility/`.

- `GET /api/users/testimonies` returns the latest 12 notes, `nextCursor`, publishing status, and the **complete** `activeNotes` ID/author/expiry index. It includes the viewer and reciprocal friends, limited to the last 24 hours.
- Cursor requests fetch subsequent pages. They do not supply a replacement complete index. Never treat one cursor page as the entire collection or delete other cached notes because they are absent from that page.
- `GET /api/users/testimonies/note/:id` resolves an individual live change with server access checks.
- POST, PATCH and DELETE publish, edit and remove notes. Love requests and owner reactor lists use the existing endpoints in their components. All requests use the signed-in token and `cache: 'no-store'`.
- `feedExpiresAt` is derived from original creation time plus 24 hours. Downloading, opening, editing, reconnecting and reinstalling the JavaScript bundle must not restart that period.
- The complete active index also drives the unseen indicator and ordinary-account publishing cooldown, including notes outside the first page. Special unlimited publishing comes from the server. The backend rechecks permissions on mutation.

## Existing note UX

- The activity rail has a Share a note card and downloaded note cards. Adding or viewing a note does not navigate through the author's avatar/name to a Profile page.
- Unopened friends' notes use the blue pin. Visiting Friends alone does **not** mark them seen; opening an individual note does. Seen markers are per account and expire with the note.
- Friends timestamps are relative (Just now, minutes, hours); Just now uses blue text. Profile timestamps use Today, Yesterday, or a date. Expanded notes retain their bottom-right timestamp.
- The composer shows the current user's avatar. Unpublished text stays in component memory, is discarded on close, and legacy saved drafts are removed. It is not part of this offline feed cache.
- Notes have a total 1,200-character content limit. Creation uses a client ID for retry safety. An existing active note normally blocks another until expiry/deletion, subject to server role rules.
- Owner actions use a horizontal three-dot menu at username height. Edit is available only during the first five minutes; Delete remains available with confirmation. Deletion removes the note from Friends and the owner's Profile collection.
- Friends' notes expose love/unlove. Optimistic reactions use the existing ordered queue; a failed save rolls back and reports an error. This change does not add a persistent offline mutation queue.
- Owners see Loved by, up to four profile pictures and the remaining count, or the empty state. Tapping the preview opens the reaction sheet. Only the owner can see the list.
- Upward dragging starts in the lower half of the note. The sheet follows the finger and settles open/closed on release using the shared gesture logic. Dragging below the opening threshold returns it closed. The sheet has no X button and reactor rows do not navigate to user profiles. Preserve the current gesture helpers and accessibility/focus handling.
- Deleting or expiring a feed item removes it from the reader's source data, so it cannot remain readable in an already-open Friends reader.

## Mission 8: persistent offline Friends notes

Implemented in this update. Previously Friends note bodies lived only in memory and a failed feed refresh erased them. Downloaded bodies now survive reload/restart and transient network failures.

### Storage boundaries

| Data | Storage / lifetime |
| --- | --- |
| Downloaded Friends note bodies and author metadata | localForage database `taspe7_app`, store `friends_note_cache`, key = signed-in user ID; version 1 snapshot |
| Feed seen IDs and original expiry timestamps | Existing localStorage `taspe7_notes_seen_v1:<userId>` |
| Avatar images | Existing avatar cache through `OfflineAvatar` / `useOfflineAvatar`; browser localForage and native Filesystem implementation remain unchanged |
| Owner's permanent Profile notes | Existing `profile_testimony_cache`; only the owner's archive persists there |
| Other people's Profile collections | Existing in-memory, access-checked Profile store; not converted into a permanent offline archive |
| Owner reactor previews/lists | Existing `noteReactorsStore` account-scoped cache; unchanged |

The new Friends body cache uses localForage in both the browser and Capacitor WebView. It does **not** use the native prayer-file storage, and does not alter Pray storage. localForage normally uses IndexedDB, subject to available platform drivers/storage policy. App/browser data removal or storage eviction can remove this cache.

Only successfully downloaded notes are saved. There is no background download of all friends' notes, photos or historical pages. Retain at most **300 newest downloaded bodies**, within a conservative **2 MiB serialized-text budget** per account. Oldest excess bodies are left out of the disk snapshot; this cap does not alter server data. The live paged feed and its complete metadata index keep their existing behavior.

### Startup and offline use

1. Activate the account store and hydrate the disk snapshot asynchronously while the normal connection startup proceeds.
2. Validate cached records and discard expired bodies before displaying them. Rebuild offline metadata from downloaded notes only; an unseen note never downloaded is not available offline after restart.
3. Show valid downloaded notes without waiting for the network. Avatar rendering continues to use the existing image cache; an image never cached may show the existing fallback offline.
4. Do not restore publishing permission or a pagination cursor from disk. They come from a successful server response. Offline reading is supported; sharing/editing/deleting still requires the server.
5. A failed network request/5xx keeps valid cached content and exposes the existing retry error. An authoritative 401/403/404/410 denial clears the affected content instead.

### Expiry and deletion

- A single timer wakes at the nearest active expiry/publishing boundary, not one timer per card and not repeated server polling. Normal visibility/resume also checks expiry.
- At expiry, remove the note from memory and persist the filtered snapshot. Expired seen markers are pruned too.
- When the application is suspended or closed, JavaScript cannot run an exact-time disk deletion. Expired content is filtered and cleaned on next activation before it is shown. Physical writes are asynchronous and subject to storage availability.
- A received `deleted` event removes the note immediately from memory and the persistent snapshot. Session deletion markers prevent later individual responses from restoring it.
- While **offline**, a device cannot know that someone deleted a note or removed a friendship. It can keep the already-downloaded note until its original expiry. The next successful authenticated sync removes revoked/deleted notes sooner. This is an unavoidable offline limitation, not a promise of remote erasure while disconnected.

### Reconnect and concurrency

- The provider refreshes on socket `notes-ready`, reconnect, online, visible resume and persisted page restoration. A startup fallback handles unavailable sockets. Concurrent feed refreshes are deduplicated; a fresh request can schedule one follow-up.
- A successful first-page response reconciles **all downloaded IDs** against the complete server active index. Missing IDs are removed. Valid downloaded later-page bodies remain available; new first-page bodies replace old copies.
- Cursor pages replace matching bodies, so loading an existing page refreshes its text/reactions. The current active index contains IDs/expiry, not content versions: a retained later-page body's missed edit/reaction is refreshed when that body is fetched again or a live event arrives. Do not claim the metadata index validates text versions.
- Live note changes fetch only the affected note. Owner reaction events with a newer reaction version update counts directly. No per-note background polling was added.
- Generation/access/revision guards reject stale requests. Reconciliation invalidates pending reads for IDs no longer authorized. Deletion markers additionally prevent delayed hydration or live responses from restoring deleted IDs.
- Friendship/access events conservatively clear the feed and revalidate; even a failed refresh must not restore a known-revoked cached snapshot.
- Disk writes are serialized. A single snapshot avoids partially written body/index pairs. Unchanged bodies are not rewritten when seen status, visibility, loading flags or timestamps change. Content changes write the bounded snapshot; this is not per-record incremental storage.
- Storage failures must not break the online feed. Failed writes can retry on subsequent changes; disk cleanup cannot be guaranteed when storage itself is unavailable.

### Account isolation and logout

The persistent cache key is the authenticated viewer ID. The provider never loads another account's snapshot. Normal tab changes/unmount/reload do not delete the offline cache.

`User_Context.jsx` dispatches `taspe7:logout`; the feed clears in-memory state and aborts requests. `clearFeedNotes(user_id)` then invalidates that account's storage adapter epoch and removes its disk snapshot. Old queued/in-flight writes cannot restore the logged-out cache. Other accounts' snapshots are not read or removed by this operation. This update does not change the cleanup policy of the existing Profile, avatar, or seen caches.

The cache is local application data, **not encryption or DRM**. It does not protect against someone with access to the same unlocked browser/account/device, and cannot recall screenshots or copied text. Backend authorization remains required on every remote read/write.

## Rules for future changes

1. Keep Friends' 24-hour feed separate from permanent Profile notes and prayer storage.
2. Keep all feed mutations in the shared store; never introduce page-mount refetch loops or a second body cache in `page.jsx`.
3. Preserve downloaded notes on transient failures. Only expiry, known deletion, authoritative access denial, complete-index reconciliation, cache limits or explicit logout should remove offline bodies.
4. Never infer deletion from a paginated response. Never extend expiry after a download/edit. Never persist server authorization as an offline permission.
5. Preserve account isolation, request/hydration race guards, deletion handling, bounded writes and the nearest-expiry timer.
6. Do not silently turn this into an offline publishing/edit/delete queue. Such a change needs conflict handling and separate UX.
7. Update this guide and relevant tests whenever these contracts change.

## Validation

Regression suites: `tests/testimony-feed-store.test.cjs`, `tests/feed-notes-storage.test.cjs`, `tests/profile-notes-store.test.cjs`, `tests/profile-notes-storage.test.cjs`, `tests/note-reactors-store.test.cjs`, and `tests/note-love-queue.test.cjs`.

They cover restart offline, transient failures, original-expiry removal, complete-index reconciliation, deletion/access/logout races, account separation, stale queued writes, cache bounds, storage failures and React StrictMode hydration, alongside existing Profile/reaction behavior. Validation on 17 November 2026: 45 store/storage/reaction regression tests passed; two browser checks passed in Chromium and mobile WebKit/Safari (API-offline reload, reading, reconnect deletion, open-reader removal and IndexedDB cleanup); the production build passed. Targeted ESLint reported zero errors and one pre-existing unused-disable warning in `User_Context.jsx`. Build/browser logs are `performance/friends-notes-offline-build.log` and `performance/friends-notes-offline-browser.log`. Automated store tests do not substitute for checking suspension, storage eviction and gestures on a physical phone.


## Friend-list pagination update ? 17 November 2026

All Friends / Profile connection lists now fetch **10 records per request**. This section concerns people, not the separate testimony feed above.

### API contract

Authenticated paths are relative to `/api/users`:

| Endpoint | Contract |
| --- | --- |
| `friends?cursor=...&q=...` | Reciprocal friends, `_id` ascending, `{items, total, nextCursor}`; optional server-side name/username search |
| `friend-requests?kind=incoming&cursor=...` | Incoming requests only, request `_id` descending, `{items, total, nextCursor}` |
| `friend-requests?kind=outgoing&cursor=...` | Sent requests only, same paging contract |
| `friend-suggestions?cursor=...` | Distinct mutual-friend count descending, candidate ID ascending; `{items, nextCursor}` |
| `friends-summary` | Small `{friends, incoming, outgoing}` totals response for badges; no populated people arrays |
| `friendship/:targetId` | One authenticated viewer-to-person relationship; never fetch every friend to check one person |
| `people-search?q=...&cursor=...` | Authenticated username-prefix search, paginated, with authoritative `relationship` on each person |
| `testimonies/profile/:userId/friends?kind=friends|mutual&q=...&cursor=...` | Existing Profile endpoint, now 10 per page instead of 20 |

`friends` and `friend-requests` additionally accept a validated `target` person ID for notification lookup. That response supplies just the relevant row; it must not replace the main list's cursor or total.

The old full `{friends}` / combined `{incoming,outgoing}` response formats are removed from these routes. The unrelated public username-search endpoint remains available for its other callers; Friends and Pray use authenticated paginated search now.

Request totals count pending request entries. Entries whose referenced account no longer exists are skipped in the public rows; cursors advance over the underlying entries so deleted accounts cannot trap pagination. Suggestions exclude the viewer, current friends, incoming requests and sent requests. Their ranking can change as friendships change; refresh recomputes loaded pages, and appends deduplicate IDs.

### Frontend behavior and files

- `../utils/peoplePageStore.js` owns list state, cursors, deduplication, refresh, retry, cache hydration and stale-response guards.
- `../utils/usePeoplePage.js` shares stores by session token/path, observes friendship changes, and persists eligible lists by viewer ID/path.
- `../components/PeoplePager.jsx` loads the next page when the list bottom approaches the viewport (120px margin), with a Show more fallback and Retry on failure.
- Requests loads incoming requests and suggestions. My Friends and Sent fetch on first activation, rather than downloading all three lists in the background. Small summary counts are independent of downloaded rows.
- Refresh keeps existing rows visible and replaces only the already-loaded depth after fetching its replacement pages. It does not crawl the entire collection. Fifteen-second freshness reuse avoids immediate repeated reads; friendship events invalidate the session's lists.
- In-progress Friends mutations pause paging/refresh, abort superseded reads and allow optimistic row changes. After the last concurrent mutation settles, active lists refresh. Late reads cannot undo accept/cancel/remove actions.
- Search result buttons use the server's relationship, including for people outside downloaded pages. Profile actions use the targeted relationship endpoint.
- Incoming-request/friend notifications can fetch one target outside page one, append it without changing the main cursor, and scroll to it. No sequential crawl to locate the notification target.
- Profile Friends and Mutual friends dialogs use the same engine, search debounce, incremental loading and retry. They preserve already-loaded session pages when reopened.
- Pray's share picker loads friend pages **only when opened**, searches friends on the server, and combines them with authenticated username results. A friend beyond page one still has the Friend badge and can be selected. Pray uses already-downloaded friends only for optional metadata enrichment; prayer participants retain their own saved metadata.

### Cache and performance boundaries

`taspe7_app / people_pages_v1` is a separate localForage store. Friends, incoming, sent and suggestions snapshots retain up to 100 downloaded rows per list with matching cursor/total. Beyond 100, the last bounded disk snapshot remains; the actively loaded list can continue in memory. Search and other people's Profile dialogs are session-memory-only. Stores without subscribers can be evicted when the session map exceeds 64 entries. Existing legacy `friends_data_<userId>` data can seed the first ten cached friends/requests during migration, then a normal refresh validates it.

Storage writes are serialized per store. Network failures keep downloaded rows and expose Retry. Cache keys isolate accounts; tokens are not persisted in the disk key. This feature does not change the offline testimony body cache, seen markers, avatar implementation, or native prayer storage.

Pagination bounds network responses, populated user records and initial UI rows. It does **not** change the MongoDB schema: friendship IDs and pending-request arrays still live on the user document. At much larger scale, moving relationships/requests into indexed collections would be a separate migration. Suggestions still compute mutual counts over eligible candidates before selecting a page. The UI renders loaded pages, not a virtualized people list.

### Verification and release

Validated with 36 backend integration tests (disposable MongoDB, including existing testimony/access regressions), 8 list-store/relationship tests, 13 browser checks covering Chromium, mobile WebKit/Safari, both Profile views, Pray recipient search, and optimistic friendship actions. Two additional offline-note browser regression checks also pass. Local list refresh events mark notes as separately handled so a failed friendship action does not clear valid offline notes; authenticated note refresh/live access events still reconcile their access. Targeted lint and production build pass. Logs: `work/friends-pagination-backend.log` at workspace root; `frontend/performance/friends-pagination-{unit,browser-final,lint,build}.log`.

Next release step: deploy the backend and the corresponding web/OTA frontend as one coordinated contract change, then smoke-test two real accounts on a phone (paging, accept/cancel/remove, notification targets, and offline/reconnect). These changes contain no native plugin or Android/iOS code changes, so this feature itself does not require a new APK. Older frontend bundles expecting the removed response shape need updating alongside the API. Nothing was deployed by this implementation task.
