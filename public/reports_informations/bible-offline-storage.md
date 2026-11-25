# Bible offline storage

**Current implementation** — New IndexedDB installs store chapters and a whole-array compatibility copy. Existing installations can still contain only the array. The reader uses chapter records when a manifest exists and can still browse array-only downloads. Follow the [implementation plan](../../docs/bible-chapter-storage-plan.md) for progress and approval gates.

### What happens when a reader opens KJV

1. The reader restores the saved translation, book and chapter. A matching last-chapter cache can supply the first visible verses.
2. On a fresh session with chapter storage, the reader opens KJV’s table of contents and reads the requested chapter. The picker uses that same table of contents. Array-only installations use their existing local index while migration is pending.
3. AVD is the default for first install and the fallback when the saved translation is unavailable. Checking which translations are installed uses storage keys. Opening Compare or searching offline can load additional data.

### Where to look before changing this feature

| Source | Responsibility |
| --- | --- |
| `src/app/utils/platform.js` | Shared localForage configuration, previous storage locations and retired translation cleanup |
| `src/app/utils/bibleChapterStorage.js` | Versioned manifests, chapter reads and transactional install, replacement and deletion |
| `src/app/utils/bibleSearchIndex.js` | Normalization, token dictionary, postings and offline relevance ranking |
| `src/app/utils/bibleSync.js` | Bundled AVD preparation, installation checks, downloads, deletion, whole-translation reads, index construction and local search |
| `src/app/bible_form/useBibleForm.js` | Reading position, last-chapter cache, translation selection, chapter navigation, Compare and presentation |
| `src/app/components/chat/HymnsBiblePicker.jsx` | Scripture lookup and search from chat |
| `tests/bible-cache.test.cjs` | Disk-read sharing, first-install initialization, indexed lookups and download or deletion races |

### Contracts to preserve

Downloaded translations must work offline. A returning reader should see the correct translation and chapter. Verse IDs and references must continue to resolve existing notes, highlights and bookmarks. Failed or interrupted work must leave a readable installed copy. Keep full-translation preparation off the ordinary chapter-reading path once chapter storage ships.

Update this report whenever an approved implementation step changes these behaviors. Record device measurements with their build and test conditions before claiming a speedup.

### Storage and rollback findings from Step 1

| Operation | Behavior at the Step 1 baseline |
| --- | --- |
| First AVD installation | App reads the bundled JSON and normalizes verse IDs. Web requests the AVD download endpoint. Both persist one verse array. Closed Hymns tools can schedule preparation at idle for an AVD selection. |
| Other downloads and replacement | The download endpoint returns a whole translation. The storage layer replaces its one key, updates the in-memory verse array and invalidates the previous index. Concurrent reads share a pending promise. Version checks protect newer data during indexing and deletion. |
| Tab navigation | The pager can prepare a neighboring component. Reader indexing requires an active or opening Bible page. A matching last-chapter cache can populate the component before that index is ready. |
| Browsing and switching | The index contains books, ordered chapter numbers and verse arrays keyed by book and chapter. Further browsing reuses it. Translations opened during the session can accumulate in the module caches. |
| Compare, presentation and chat | Compare requests each participating downloaded translation's index. Presenting a search result can fall back to AVD. The chat picker explicitly requests AVD for browsing and local search. Include all three callers in the chapter API cutover. |
| Search | The reader debounces input for 400 ms. It prefers ranked online search when reachable. Offline search walks the selected verse array in cooperative batches, caches normalized text per verse, ranks matches and can stop after 50 phrase hits. Search memory and timings depend on the query. |
| Legacy migration and cleanup | The canonical IndexedDB database/store is `taspe7_app/bible_store`. Startup can copy missing keys from `taspe7_app/hymns_store` or `localforage/keyvaluepairs`. Hyphen and underscore aliases are supported on reads. Existing cleanup removes retired KEH and ERV-AR aliases and associated preferences. |

The available release tags v2.0.1 through v2.0.5 and v2.0.7 through v2.0.15 contain the whole-array key format `taspe7_bible_db_<CODE>`. This is source evidence about those readers. The active and rollback bundles on individual devices can differ. Keep a verified rollback path before retiring these keys. Browser integration fixtures and the navigation benchmark also seed these keys directly.


### Chapter storage contract introduced in Step 2

The IndexedDB driver uses the existing localForage database and object store. Multi-key changes use one native IndexedDB transaction there. On a fallback driver, installs continue to use the whole-array format. An existing download can be converted during an idle period after a successful reader open.

- **Layout.** The namespace is `wasla_bible_v1/<CODE>/`. Its `manifest` records schema 1, the active dataset version, translation code, total verse count, ordered books and chapters, and each chapter's key and verse count. Records under `data/<version>/<encoded book name>/<chapter>` contain complete verse objects in verse-number order. The existing `taspe7_bible_db_<CODE>` array remains available to the current reader and older OTA bundles.
- **Reads.** `readBibleContents` retrieves just the manifest. `readBibleChapter` reads the manifest and the requested chapter in a shared readonly transaction. It returns null when chapter storage is unavailable for the requested reference. Installed-translation checks enumerate the legacy key prefix without loading verse values.
- **Publication.** An install reserves a version before fetching. A newer explicit reservation supersedes an older one. After validating verse references and grouping the rows, the install checks its reservation, writes the chapter records, verifies their count, writes the compatibility copy, and publishes the manifest last. The transaction commits everything together. The previous dataset remains readable if a write fails.
- **Recovery.** Failed or interrupted transactions leave no committed staging chapters. A failed fetch may leave one small reservation per translation, which the next explicit install replaces. Deletion clears the namespace, compatibility array and alias in one transaction. A download with an invalidated reservation cannot republish its data.
- **Storage cost.** Fresh installs temporarily retain two representations of the verse text. A replacement also needs transaction headroom. See the retention policy below before changing either copy. Ordinary browsing uses chapter records after the manifest is published.
- **Regression checks.** Run `node --test tests/bible-cache.test.cjs tests/online-bible-search.test.cjs tests/bible-chapter-storage.browser.cjs` from the frontend directory with Playwright Chromium and WebKit installed.


### Offline conversion of existing translations

- **Trigger.** After the first successful Bible open, the reader schedules one conversion pass per document, with a five-second delay followed by an idle callback where supported. Conversion waits for the existing storage import to complete. It enumerates installation keys, skips retired codes and published datasets, and processes one translation at a time. Web Locks coordinate the pass across supporting tabs.
- **Cost.** A legacy translation occupies one IndexedDB value. Conversion must read that full value once per attempt. Grouping yields in batches. Chapter writes use short transactions of up to 16 chapters. Between batches the converter yields and waits for active navigation to finish. A transaction already in progress may finish during a gesture.
- **Integrity.** A per-translation migration marker identifies the staging version. Each batch reads its writes back and checks verse count, IDs, verse numbers and text against the source. Publication checks the total chapter and verse counts, the source key and the marker before making the manifest visible. Both hyphen and underscore spellings can resolve the manifest and chapters.
- **Recovery.** After interruption, a future reader session discards the abandoned staging version and restarts that translation from its local array. On a quota error it discards the failed staging records, keeps the original and stops the pass. If cleanup itself fails, the next attempt can reclaim the abandoned records. A completed replacement or deletion invalidates stale work. An explicit deletion also removes matching original arrays from historical stores.
- **Rollback policy.** Keep the original array on disk after successful conversion. Removal requires all deployed readers and supported OTA rollback targets to be able to read chapter storage, or a verified procedure that restores the old format before an older reader starts. Confirm that policy and test rollback on a device before enabling any automatic removal. User-requested translation deletion removes both formats.

### Chapter browsing after Step 4

The Bible reader and desktop Bible presentation share the reader controller. Compare reads the requested chapter for each participating installed translation, then filters by verse number. Presenting a search result tries its translation and can fall back to the corresponding AVD chapter. The chat Scripture picker requests local AVD books, chapters and verses first and can use its existing API when local content is unavailable.

Chapter storage retains up to four recently used chapters across translations. Each lookup checks the active manifest version, so a replacement in another tab changes the cache key. Warm returns can read metadata while reusing the cached verses. The last-chapter snapshot remains available for immediate display when its translation, book and chapter match. Pending UI reads are discarded when the user switches away. Offline search has its own versioned index and can read the compatibility array once to build it.

Run `node --test tests/bible-reader-chapters.browser.cjs` against a running frontend to verify direct entry, tab taps, touch swipes, chapter changes and an out-of-order translation read. The test uses an isolated browser context with fixture data. Set `WASLA_READER_TEST_URL` to change the default server at localhost port 3000.

### Offline full-text search

- **Entry.** The reader prefers ranked online search when connected. An empty successful online response stays empty. Offline or failed network searches use the local translation. Opening the reader search field offline or focusing the chat Scripture search can prepare the index while the user types. Ordinary Bible navigation does not start this work.
- **Construction.** The first offline use of a translation version reads its compatibility array once and builds a token dictionary cooperatively. Local callers share an in-flight build. Source verse order is preserved for ties, even when older installed rows are unsorted. Tokens retain whitespace and punctuation for exact phrase matching. Packed integer arrays hold verse postings, token positions and chapter references. The complete index is published in one transaction at `wasla_bible_v1/<CODE>/search/1/<dataset version>`.
- **Queries.** Search normalizes Arabic characters and case using the same rules as the legacy scanner. Dictionary substring matches identify candidate verses. Exact phrases take priority, followed by all-word matches, then descending count of matched query words. Up to 50 hits are returned in source order within each rank. One read transaction checks the active version and retrieves only distinct result chapters. A query with no hits reads zero chapters. The chat picker displays up to 15 hits.
- **Memory and recovery.** One completed search index stays in memory. Later sessions load the saved index. If storage is full, the current session can still search using the in-memory index. A missing or structurally invalid saved index is rebuilt. Replacement and deletion clear the old version on disk, and result reads check the current manifest before returning hits. Array-only installations keep the original search behavior until their chapter migration completes.
- **Cancellation.** New queries abort previous lookups. A cancelled caller stops waiting for a shared build; construction can finish for the next query. Search loops yield and check cancellation, and the reader and chat picker guard against publishing obsolete results.
- **Coverage.** Run the cache, chapter-storage, online-search and reader browser suites. The chapter-storage browser suite compares legacy and indexed results and reports a real AVD desktop sample. Record device and build conditions separately before making mobile latency claims.

### Step 6 release validation, November 25, 2026

Desktop Chromium ran the same production webpack benchmark protocol as Step 1, using offline John 3, a saved chapter snapshot, two 31,102-verse translations and a simulated Android bridge. Each translation ran in five fresh documents after migration. First interaction includes tapping Bible, activating Next Chapter and observing John 4. Swipe timing includes the automated gesture. Search includes the UI debounce. Values below are medians with ranges in parentheses.

| Desktop Chromium | John 3 visible, ms | John 4 interactive, ms | Heap above Pray, MiB | Swipe return, ms | Offline search, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| KJV | 22 (21–27) | 57 (45–63) | 0.7 (0.7–0.7) | 391 (387–393) | 828 (826–832) |
| AVD | 23 (20–28) | 62 (57–70) | 0.7 (0.6–0.7) | 403 (389–407) | 830 (819–841) |

- **Read counts.** Every trial read the selected translation’s John 3 and John 4 payloads exactly once each. Opening and browsing read zero whole translations or unrelated chapters. Returning by swipe added zero verse reads. The first search per translation built its index. Later documents reused it.
- **Thresholds.** Baseline interaction ranges were 98–106 ms for KJV and 119–129 ms for AVD. Baseline retained heap increases were 14.2 and 19.0 MiB respectively. Both desktop interaction and heap targets passed. First-visible, swipe and search medians were within the allowed regression margin relative to the Step 1 ranges.
- **Storage.** One desktop migration of both legacy fixtures took 3.66 s. Chromium’s origin usage estimate went from 10.2 MiB to 23.1 MiB, with a sampled high of 28.7 MiB at 50 ms polling. Actual transient disk usage can be higher. In a separate fresh-install fixture, publishing already-decoded AVD took 1.47 s and KJV took 2.07 s. After both installs the estimate was 23.2 MiB, rising to 28.7 MiB after building both search indexes. Downloads and network time are excluded.
- **Functional coverage.** The 35 focused checks cover new installs, offline legacy upgrades, interrupted conversion, quota failure, reopened documents, deletion, rapid translation changes and offline search. A Windows Playwright WebKit page closed during the full-seed check on the first run. The other 34 passed, and the full-seed check passed on its isolated retry.
- **Release status.** Desktop browser validation passed. Galaxy A24 Chrome and installed Android WebView comparisons remain pending. Desktop WebKit exercised storage behavior. Physical iOS performance and OTA rollback have not been verified. Hold final acceptance until the phone comparison meets the plan’s thresholds. Preserve the whole-array rollback copy through rollout.
