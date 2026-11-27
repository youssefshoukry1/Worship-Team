# Profile loading and offline history

Read this before changing My Profile, its Bible settings or its social note rail. The menu, private Bible records, social notes and AI usage have different owners and refresh independently.

## Opening Profile

The owner menu reads its cached identity and grouped counts from `profile_summary_v1_<owner>`. An active visit can refresh them through authenticated `GET /api/users/profile-summary`. A fresh return reuses the summary. Preparing Profile during a swipe must never fetch private Bible collections. Billing supplies AI usage independently. The social profile supplies friend statistics and publishing permissions.

Keep the summary separate from `profile_data_<userId>`. The broader snapshot still serves the active Bible reader, Pray history repair and the Hymns prayer modal. Saving a summary over this key would discard fields those consumers use.

## Bible Notes and Highlights

Opening a setting requests its first ten complete groups from `GET /api/users/profile-bible/notes` or `/highlights`. Following the returned cursor loads another page. The menu uses server counts. Groups match book, chapter and exact note text or highlight color within a window strictly under 60 seconds from the group's first verse. Owner views span teams. Individual edits retain their verse and team identity.

The server derives indexed group rows from the owner's embedded annotations. Each collection has a version. A cursor belongs to one owner, collection and version. A mismatched scope returns 400. A stale version returns 409 and requires restarting pagination. Index order is owner, kind, then descending position. Writes recompute the affected kind and commit changed rows, count and version in one transaction. Very large histories can therefore still make edits expensive.

IndexedDB stores pages in `taspe7_app/profile_bible_pages`, scoped by API, owner and collection. Render the first ten groups as ordinary cards. Once more than ten are loaded, window the full list with Virtuoso. The footer observes proximity to request more on downward scroll. The manual load button also works offline for previously saved pages. In-session navigation retains the reading anchor. A cold reopen starts from the first saved page.

Profile, Bible and Workspace write annotation gestures to the durable `wasla-bible-changes` journal. Foreground and service-worker replay use the same sequence protocol. The server acknowledges a repeated sequence without applying it twice. Cached pages overlay pending changes. A count can show an ellipsis until the server confirms a split, merge or deletion. Revalidate the affected collection after acknowledgement and retire confirmed changes after persisting current pages.

## Social notes

The owner's social profile uses `GET /api/users/testimonies/profile/:id?paged=1`. The first response contains up to 12 notes. More loads another 12. The horizontal rail renders visible cards and a small buffer, remembers its scroll offset and retains keyboard focus. Removing a card from the DOM never deletes its saved body.

The owner's `taspe7_app/profile_testimony_cache` stores the first page with its header. Older bodies are keyed individually by note ID and revision within the viewer's cache. Older cached notes open offline, including from a reaction notification. A collection version check handles unchanged history. The server retains 32 changes. A client that missed that window reconciles metadata in pages of up to 50. Confirmed deletions invalidate saved bodies. Visitor bodies stay in session memory and follow the social endpoint's access checks. The separate Friends feed has its own 24-hour expiry.

## Release order

### Measurements to preserve

Five Galaxy A24 WebView trials used 1,000 synthetic entries in each Bible collection, producing 501 groups per setting, plus 120 social notes. Assets were local and API responses were fixtures. Times are medians. The menu marker is the first visible numeric Highlights count.

| Galaxy A24 metric | Before | After |
| --- | ---: | ---: |
| First Profile menu | 1,025 ms | 1,112 ms |
| Warm return from Friends | 601 ms | 470 ms |
| Offline document restart | 1,174 ms | 998 ms |
| Open Highlights | 661 ms | 208 ms |
| Open Notes | 736 ms | 185 ms |
| Worst frame in short scroll probe, median across trials | 33 ms | 83 ms |

The menu made one 127-byte owner summary request in place of a 580,702-byte private profile response. Neither private collection was requested until its setting opened. Focus and warm return added no owner-summary or private detail traffic in the long fixture. The initial social response fell from 14,055 to 2,921 bytes. These are uncompressed synthetic response sizes. Document-wide IndexedDB instrumentation still saw one prayer-index read and two small Bible journal summary reads on menu entry.

On the A24, long settings initially mounted four Highlights cards and three Notes cards, previously 501 each. The social rail mounted six cards after loading 120 and six on offline restart. The empty and typical phone profiles showed no consistent time saving. The longer initial menu time and increased frame gap warrant a phone trace before rollout. The scroll probe covers only 12 frames and cannot establish sustained finger-scroll performance.

### A24 rendering follow-up

A WebView trace found scroll callbacks, React work and repeated style/layout updates during the first page of Bible records. The first ten now stay mounted together and the record cards use a plain background during scrolling. An 80-group desktop test found six or seven cards mounted at the far end and restored the last record after visiting the other setting.

On a direct signed-in Profile launch, the pager begins loading the requested screen during hydration. Only a direct owner-menu entry with no query or hash starts the owner summary early. The mounted menu joins that same request. Friends swipe previews, visitor profiles and Bible detail routes continue to use their own loading rules.

Five long-history trials per build in the same A24 WebView measured these medians. The count marker records when the numeric text appears in the DOM. The earlier automation marker includes locator polling and device-control time, so its 87 ms difference could not establish a visible regression. Neither marker measures native app launch.

| Measurement | Step 7 build, repeated | Revised build |
| --- | ---: | ---: |
| Owner summary request starts | 627 ms | 469 ms |
| Numeric count in the DOM | 761 ms | 658 ms |
| Automation detects menu | 1,068 ms | 1,031 ms |
| Largest frame gap during first-page Highlights scroll | 83 ms | 17 ms |
| Largest frame gap during first-page Notes scroll | 67 ms | 17 ms |

The frame measurements cover 12 programmatic scroll frames per trial. Test assets ran on isolated origins with synthetic data in the installed app's WebView. Timing variation, API latency on real networks and sustained touch scrolling should be considered when comparing release builds.

### Deployment

1. Deploy compatible API handlers to all instances on transaction-capable MongoDB.
2. Verify the unique group index on owner, kind and descending position. Run the backend maintenance script `node scripts/backfill-profile-bible.cjs --rebuild` against the intended database. Check grouped counts against source entries and inspect first and deep page query plans before enabling clients.
3. Release the client, service worker and Bible change journal together. Check a warm return, an offline edit followed by reconnect, and an older social note opened from a notification. Keep server support when rolling back the client.
