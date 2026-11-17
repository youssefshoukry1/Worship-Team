# Friends system: behavior, storage and maintenance guide

Updated: 17 November 2026.

Read this before changing friendship requests, people lists, local friend search, Profile connections or Pray's recipient picker. Paths below are relative to the frontend or backend repository as indicated. This report supersedes the earlier server-search-only description for **the viewer's own friends**.

## 1. User-facing behavior

The Friends page has Requests, My Friends and Sent tabs. Requests shows incoming requests first, followed by mutual-friend suggestions. Sent is a separate list. Counts describe the collection, not how many cards have been downloaded or rendered.

My Friends searches a lightweight directory stored on this device. Typing a name or username does not send a search request. Search is case-insensitive, ignores diacritic marks, supports Arabic and multiple words, and accepts a leading `@`. Results appear ten at a time, with more loaded locally near the bottom. Downloading the directory does not render all its people as cards.

The same local search is used in the owner's Profile friend dialog and Pray's recipient picker. Pray offers a separate **Search other people online** button: discovering people outside the friend directory is an explicit online action. Friends' discovery search outside the My Friends tab remains online.

Another person's Profile Friends / Mutual friends lists remain server-based and paginated. Their entire social graph is not saved as an offline directory on the viewer's device.

The first directory preparation needs a connection. Partial saved results are usable, but the UI says that preparation is incomplete instead of claiming that every friend is searchable. After preparation completes, all saved names remain searchable across app/browser restarts without internet. Storage-denied or quota failures show a message; online functionality still works in memory.

## 2. Ownership and file map

| Frontend file | Responsibility |
| --- | --- |
| `src/app/friends/page.jsx` | Tabs, requests, discovery, optimistic actions, totals, notification targets |
| `src/app/utils/friendDirectory/store.js` | Directory synchronization, normalized search index, completeness, removals, stale-response protection |
| `src/app/utils/friendDirectory/storage.js` | Account-scoped IndexedDB rows/checkpoints, atomic writes, legacy-cache migration and logout cleanup |
| `src/app/utils/friendDirectory/useLocalFriends.js` | Authenticated directory session, lifecycle triggers, shared instance and local pages of ten |
| `src/app/components/FriendDirectoryStatus.jsx` | Preparation, offline refresh and device-storage messages |
| `src/app/utils/peoplePageStore.js`, `usePeoplePage.js` | Server-paged requests, suggestions, discovery and other people's Profile lists |
| `src/app/components/PeoplePager.jsx` | Incremental display, near-bottom loading, manual fallback and retry |
| `src/app/utils/friendshipActions.js` | Targeted relationship checks and mutations, including local removal rollback |
| `src/app/components/profile/ProfileStats.jsx`, `ProfileFriendsDialog.jsx`, `FriendshipControls.jsx` | Profile counts, people dialogs and add/cancel/accept/remove controls |
| `src/app/pray/PrayerSharePicker.jsx` | Local friend selection and explicit online discovery |
| `src/app/components/testimonies/TestimonyFeedProvider.jsx` | Owns the logged-in directory session alongside note stores; relays authenticated connection/access events |
| `src/app/context/User_Context.jsx` | Logout event and account lifecycle |

| Backend file | Responsibility |
| --- | --- |
| `Utility/friendDirectorySync.js` | Bounded initial snapshot and signed cursor-based event replay |
| `Utility/friendDirectoryWrites.js` | Transactional User write boundary and account-scoped event fan-out |
| `models/friendDirectoryLog.js` | Per-account sequence counters, indexed events and 90-day TTL |
| `Controlls/FriendDirectory.api.js` | Previous protocol endpoints; current clients no longer use these |
| `models/friendDirectoryIdentity.js` | Identity-only timestamp middleware |
| `models/model-Users.js` | Friend/request arrays and directory timestamp field |
| `Controlls/FriendLists.api.js` | Paged friends/requests, totals, relationship and discovery lookup |
| `Controlls/FriendSuggestions.api.js` | Mutual-friend ranking and suggestion cursor |
| `Controlls/Users-api.js` | Friendship mutations and existing activity notifications |
| `Controlls/Testimonies-api.js` | Profile friend lists, reciprocal access checks and notes |
| `Utility/testimonyEvents.js` | Authenticated access changes, including recipient-specific removal IDs |
| `Routes/Users-Router.js` | Authentication and endpoint registration |

## 3. Friendship request lifecycle

- Sending a request creates an outgoing entry for the sender and an incoming entry for the recipient.
- A request in the opposite direction can be accepted by sending back; an explicit Accept action also establishes the relationship.
- Cancel removes the pending entries. The same existing endpoint supports declining an incoming request.
- Remove deletes the relationship from both accounts. Shared-content authorization requires the current reciprocal relationship; cached directory membership never grants permission.
- Existing duplicate, self-request, missing-user and Already friends handling remains server-owned. Structured Already friends errors preserve the accepted relationship in the UI.
- Requests and lists use optimistic updates where already supported. Failed operations restore the prior UI state. Profile rapid add/cancel operations retain their ordered request queue.
- While Friends mutations are in progress, directory/list refreshes pause and obsolete requests are invalidated. Concurrent operations resume synchronization after the final operation settles.

Own removal immediately removes the person from local directory search and schedules the corresponding disk deletion. If the server rejects it, the saved record is restored. The same path is used from Friends and Profile actions.

When another person removes the viewer, the existing authenticated socket delivers `removedFriendId` to that viewer's session. The directory removes that record immediately and rejects older in-flight responses. If the event was missed, a successful reconnect log sync removes it.

**Offline limit:** a disconnected device cannot know that another person removed it. A previously saved name may remain until the removal event or the next successful reconciliation. The server still checks authorization for sharing, mutations and protected content. This system cannot recall copied text, screenshots or backups outside the application.

## 4. People endpoints and pagination

Authenticated paths are relative to `/api/users`.

| Endpoint | Response/use |
| --- | --- |
| `GET /friend-requests?kind=incoming&cursor=...` | Up to 10 incoming requests; `items`, `total`, `nextCursor` |
| `GET /friend-requests?kind=outgoing&cursor=...` | Up to 10 sent requests; same shape |
| `GET /friend-suggestions?cursor=...` | Up to 10 eligible suggestions; `items`, `nextCursor` |
| `GET /friends?cursor=...&q=...` | Existing bounded reciprocal-friends API; no longer used for own-directory keystroke searches |
| `GET /friends-summary` | Small friends/incoming/outgoing totals response |
| `GET /friendship/:targetId` | One viewer-to-person relationship, independent of downloaded pages |
| `GET /people-search?q=...&cursor=...` | Authenticated paged username discovery with relationship labels |
| `GET /testimonies/profile/:userId/friends?kind=friends|mutual&q=...&cursor=...` | Up to 10 people for another Profile's list/search |

The request cursor uses request ID descending; friend/profile lists use person ID ascending. Suggestions sort distinct mutual connections descending, then candidate ID ascending, and exclude self, existing friends and pending requests. Their ranking can change as relationships change; refresh and ID deduplication handle that rather than promising a permanently frozen ranking.

The Friends tabs fetch server-based collections when needed. Scrolling loads the next ten; duplicate rows and overlapping fetches are suppressed. A failed next page preserves prior rows and retries that page. Refresh replaces only the already-loaded depth and keeps old rows visible until replacement is ready.

The optional validated `target` parameter on friends/requests supports notification targets beyond the first page. A targeted response must never replace the main list's cursor or total. Request totals count pending entries; references to deleted accounts may be skipped when rendering public rows.

## 5. Directory synchronization protocol

The directory is separate from the ten-card UI. It transfers at most **200 lightweight identity records per batch**, yields between batches, and makes no avatar-image downloads for the whole directory.

### Endpoints and normal operation

- `GET /friends-directory/snapshot?after=<id>&cursor=<baseline>`: initial/recovery data only, at most 200 public identities. Returns `items`, `next`, and an opaque signed baseline `cursor`. The first request omits both parameters. Subsequent pages preserve the original baseline.
- `GET /friends-directory/sync?cursor=<token>`: returns at most 200 log events resolved into deduplicated `changes`, a new `cursor`, and `hasMore`. Each change is `{ type: "upsert", person }` or `{ type: "remove", id }`. No changes means an empty array. An invalid, expired, cross-account or gap-containing cursor returns `{ reset: true }`.

**Normal reconnects do not download the complete list of friend IDs or names.** They use only `/sync`. The previous manifest/timestamp endpoints remain registered for the previous protocol; the current client does not call them.

Public identities contain only ID, name, username and photo URL. Images remain in the existing avatar cache. Passwords, emails, request arrays, church/private data and note contents are never included.

### Durable server writes

`friendDirectoryWrites` installs a write boundary on the User model's query execution and document save paths. Identity fields (`Name`, `username`, `profilePhoto`), membership updates and account deletions are compared inside a MongoDB transaction. The relevant data write, sequence increments and directory events commit or abort together. Existing caller transactions are reused; otherwise the connection transaction helper handles retries. Operations inside a transaction run sequentially, following the [Mongoose transaction contract](https://mongoosejs.com/docs/transactions.html).

Each affected account has a monotonically increasing sequence counter. Events contain an owner ID, affected friend ID, sequence and timestamp. They are invalidations, not historical profile copies: replay resolves current public identity and reciprocal authorization. A now-removed or deleted friend returns a removal instead of exposing an old profile. A friendship change produces events for both accounts. Identity edits fan out to that person's friend subscribers. Unrelated user activity produces no directory events.

Accepting a request (including accepting by sending back) and removing a friend update both users in one transaction. Notifications are emitted after commit. Duplicate events are safe: replay upserts/deletes by ID.

Supported query paths include updateOne/updateMany/findOneAndUpdate, replacement and query deletion; document save is supported. Directory-affecting upserts and bulk writes are rejected; creating users with pre-existing friendships must use save rather than insertMany. Raw `User.collection` writes bypass this boundary and must not be used by production identity/friendship writers. External tools or migrations require a deliberate logging/recovery strategy. The old identity timestamp middleware remains for the previous endpoints, but stamping a timestamp alone does not update the new log.

### Snapshot, replay and recovery

1. Restore saved account records and the version-2 checkpoint.
2. With a valid cursor, request only new log events. Apply changed rows and the cursor in one IndexedDB transaction.
3. Without a cursor (first setup, old-cache upgrade, cleared storage or recovery), download a bounded snapshot. Capture the sequence before the first page. Keep partial saved rows available while preparing.
4. At snapshot completion, remove stale local rows not seen in the snapshot, save its baseline cursor, then replay changes after that baseline. Concurrent edits, additions and removals during pagination are therefore recovered by the log.
5. Interrupted snapshot preparation restarts pagination and reuses/upserts saved rows. Interrupted log replay resumes from the last durable cursor. Failed disk writes retain dirty rows/removals with their checkpoint until a later write succeeds; no later cursor is persisted without those rows.

Events expire after 90 days using a TTL index. Signed cursors expire after 89 days, leaving a retention margin. Sequence-gap checks also detect missing events even if a token has not expired. Recovery is bounded and explicit; offline data is retained while a failed recovery is retried. A full snapshot is exceptional, not part of every reconnect. Cursor signing uses the backend JWT secret with a separate purpose and account binding; never log cursor tokens.

Login/session startup, visible resume, online/socket reconnect, friendship notifications and Retry trigger syncing. Ordinary resumes reuse the existing freshness window. There is no per-keystroke sync or continuous polling. Name/photo updates missed while disconnected are applied on the next successful sync. Existing removal notifications can evict a person immediately; notifications are hints, while the durable log recovers missed events.

## 6. Device storage, account isolation and migration

Browser and Capacitor WebView use IndexedDB database `wasla_friend_directory_v1`:

- `people`: composite key `[ownerId, friendId]`; lightweight identity rows only.
- `checkpoints`: key `ownerId`; schema version 2, signed sync cursor, known IDs and completeness. The database name/version stays unchanged because its object-store schema is unchanged.

Changed rows, removals and any associated checkpoint are committed in a single IndexedDB transaction. Writes are serialized per account. Updates do not rewrite every friend's record. Metadata ID lists are written at synchronization checkpoints, not while typing. Search normalization is an in-memory index rebuilt on restore and updated only for changed rows.

The old bounded `people_pages_v1` friends snapshot or legacy `friends_data_<userId>` friends array can seed a partial offline directory. It is never mistaken for the complete friend collection. Once the new complete checkpoint is safely saved, obsolete friend-list copies are retired; incoming/sent caches are preserved. Logout also clears the directory and its obsolete friend-list copies.

Logout invalidates pending requests and the storage adapter epoch, deletes only the logged-out account's directory, and prevents queued old-session writes from recreating it. Normal navigation and closing/restarting the application preserve the directory. Other accounts' directories are neither searched nor exposed.

Requests, suggestions and other server-paged people lists keep their separate bounded caching rules. Notes, prayer files, offline outboxes and avatar blobs keep their existing storage systems. The directory is not an encrypted vault or a replacement for server authorization.

## 7. Notes and notification boundaries

Friends notes use the separate shared testimony feed and retain their original 24-hour expiry. Downloaded note bodies can be read offline; deletion/access changes reconcile when online. The owner's permanent Profile archive is separate from the temporary Friends feed. Seen markers, reaction queues and Loved by sheets are not moved into the friend directory.

The note provider hosts the authenticated connection and relays directory resume/removal signals. A directory refresh must not clear valid offline notes merely because a network request failed. Detailed note UI, storage and reaction contracts remain in `src/app/friends/README.md`.

Friend notifications can open the relevant tab and locate a person outside the visible ten rows. Directory membership must never be used as permission to expose an anonymous prayer sender; prayer identity/anonymous handling remains owned by the prayer data flow.

## 8. Performance boundaries

Thousands of small identities are reasonable for this design; thousands of mounted cards or eagerly fetched photos are not. Directory preparation uses 200-record batches, while cards are exposed in batches of ten. Only visible/loaded people use the existing avatar behavior. Offline name search scans the normalized lightweight index once per query; it makes no disk read or network request per keystroke.

Backend friend IDs and pending requests still live on the existing user documents. Snapshot and changed-entry authorization inspect those relationships. The indexed event query reads only events after the saved sequence. Identity edits create an event per affected friend; this write fan-out is a deliberate cost, not a claim of constant-cost updates for unlimited follower graphs. This change reduces repeated transfer and client rendering; it does not claim constant-cost backend processing for unlimited social graphs. Moving relationships into their own indexed collection would be a separate schema migration if measured scale requires it.

Local result pagination incrementally renders loaded pages; it is not full people-list virtualization. Search, network and storage timings should still be checked on a real low-end phone before release.

## 9. Validation and maintenance rules

Relevant automated suites:

- Backend: `tests/friend-directory-log.test.js`, `friend-directory.test.js`, `friend-pagination.test.js`, `friend-suggestions.test.js`, `testimonies.test.js`.
- Frontend state machines: `tests/friend-directory-store.test.cjs`, `people-page-store.test.cjs`, `friendship-state.test.cjs`.
- Browser: `tests/friend-directory.test.mjs`, `friends-pagination.test.mjs`, Profile friendship/dialog suites and offline-note regressions.

Coverage includes a 10,000-name directory, no-request local search, 200-record sync batches, delta-only row writes, offline restore, missing old-profile additions, removals and rollback, interrupted synchronization, membership races, Unicode search, both-side authorization, Chromium/WebKit, own Profile and Pray selection.

Before changing this system:

1. Keep own-directory search separate from online discovery and other people's Profile graphs.
2. Never derive relationship or permission from a partial page or stale offline cache.
3. Do not persist a cursor without the corresponding row changes; preserve partial results on failure.
4. Preserve account isolation, logout epochs, mutation pauses and late-response guards.
5. Keep photo blobs out of directory records, and never render every directory entry just because it was downloaded.
6. Keep counters separate from visible result length. Mark incomplete preparation explicitly.
7. Update this report, source guides and contract tests together.

### Verified in this implementation

- Backend log, directory, pagination, suggestions and testimony suites: 45 tests passed.
- Shared User-write regressions (billing, AI quota/controls and friend notifications): 53 tests passed. Quota fixtures now use a replica set to match the transaction requirement.
- Directory and friendship state suites: 13 tests passed, including 10,000 lightweight identities, expired-cursor recovery and failed local-write recovery.
- Chromium/WebKit directory and pagination flows: 6 tests passed, including 1,250 identities, offline reload, local Profile/Pray search and removal rollback.
- Real IndexedDB migration/account-isolation test: passed; covers legacy row persistence, logout and stale writes.
- Targeted frontend lint and production build: passed.

Browser fixtures exercise the UI with mocked API responses; backend tests exercise authorization and data contracts separately. These results do not replace a real-device/end-to-end release check. Storage coverage is in `tests/friend-directory-storage.test.mjs`.

## 10. Release status and next step

This change requires a MongoDB replica set (Atlas is suitable), as do the existing billing/testimony transactions. Ensure the `FriendDirectoryEvent` unique `{ owner: 1, sequence: 1 }` index and `createdAt` TTL index exist, and the state counter has its normal unique `_id` index. Model initialization creates these when automatic index creation is enabled. All backend instances and identity writers must run the new write boundary before issuing new log cursors. Mixed old writers can otherwise create unlogged changes.

This is a frontend/backend implementation; it has not been deployed by the editing task. Deploy the transactional write boundary, log indexes and cursor endpoints before releasing the corresponding web/OTA bundle. Existing paginated people APIs remain available. Existing local names remain usable during a one-time upgrade snapshot; subsequent reconnects are incremental. No new native plugin or Android/iOS code is required by the local directory itself.

Then verify with two accounts on a physical phone: complete initial preparation, search offline after restart, accept a request, remove from each side, change a name, reconnect, check a notification target, test Pray selection, and log out/switch accounts. Check device-storage-denied behavior and low-end-phone responsiveness. Do not describe immediate remote deletion while disconnected as a supported feature.
