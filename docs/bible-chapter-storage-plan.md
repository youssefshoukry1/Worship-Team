# Bible chapter storage implementation plan

**Status** — Step 6 in progress. Desktop validation recorded. Mobile release acceptance is pending. The installed Android WebView baseline from Step 1 remains outstanding.

**Outcome** — A reader returning to KJV, John 3 can read and interact with that chapter offline using the translation’s table of contents and chapter record. Ordinary browsing should keep a bounded amount of verse text in memory, including after switching translations.

**Approval rule** — Start each numbered step only after the user explicitly approves that step. At its end, record the changes, tests, measurements and remaining issues here, summarize them to the user, and stop. Approval for one step covers only that step. If a check fails, resolve it within the current step or report the blocker before advancing.

**Engineering reference** — Read the [Bible offline storage report](../public/reports_informations/bible-offline-storage.md) first. Update its description of shipped behavior as each approved change lands. Use this plan to track pending work.

| Step | Deliverable | Status |
| --- | --- | --- |
| 1 | Baseline and reader contracts | Browser baseline recorded; installed WebView pending |
| 2 | Chapter storage and new downloads | Complete |
| 3 | Existing-download migration and recovery | Complete |
| 4 | Reader and related Bible tools | Complete |
| 5 | Offline search | Complete |
| 6 | Device validation, rollout and final report | Desktop verified; phone comparison pending |

### Step 1 — Measure the current reader

Trace first-install AVD preparation, web and app downloads, storage migration, Bible tab activation, translation switching, chapter browsing, Compare, presentation, chat’s Hymns Bible picker and search. Identify direct storage consumers and which older OTA bundles may still read the existing keys.

On the Galaxy A24, baseline a fresh app session with KJV already downloaded and John 3 saved. Repeat with AVD. Distinguish first visible text from the first successful chapter interaction. Record translation reads, time to interaction, retained JavaScript heap where measurable, and repeated swipe timings. Measure offline search separately. Record build, device, connectivity, sample count and range so Step 6 can repeat the comparison.

**Pass when** the current read paths and reproducible measurements are recorded, along with any measurement limits and agreed regression thresholds. Stop for approval.

#### Step 1 measurement protocol, November 25, 2026

- Use the current worktree based on frontend commit `918dcc3`, including the selected-translation reader change. The test uses a production webpack export in a temporary copy. The standard build's type check stops on an unrelated required `id` prop in the Metronome route. Only the isolated benchmark export skipped type validation.
- Use a separate origin, a fixture account, offline reader state and stubbed external services. Seed the real IndexedDB with 31,102 verses per translation. Normalize bundled AVD IDs as on first install. Construct KJV rows from the repository's English VPL source with deterministic fixture IDs. Save John 3 and its matching 36-verse cache for each run.
- Alternate KJV and AVD for three runs each. Start a fresh document on Pray, wait for bottom navigation plus 900 ms, collect garbage and measure JavaScript heap. Tap Bible. Sample on animation frames until the active panel contains John 3's first verse. As soon as Next Chapter is enabled, activate it and verify the first verse of John 4 appears. These are DOM-visible and successful-interaction proxies. They exclude APK launch and do not measure display presentation or pure IndexedDB latency.
- Collect garbage again and record the heap difference versus Pray. Count IndexedDB `get` operations for translation payloads. Swipe Bible → Pray → Bible using five touch-move events per swipe; time from touch start to observed destination activation. This includes gesture and automation latency. Run the first offline search for “Nicodemus” or “نيقوديموس” and time input through the first result, including the 400 ms debounce.
- For Step 6, repeat with the same device, browser or WebView version, passage, build mode, instrumentation and source fixtures. Run at least five trials per translation before making a release decision. Measure migration and fresh installation separately from already-installed translations.

**Proposed acceptance thresholds for user approval.** Require zero full-translation reads on migrated chapter entry, zero unrelated translation reads and zero extra verse reads on a warm return to the same cached chapter. Target at least 50% lower median retained heap increase versus Pray and a lower median time to successful chapter interaction for both translations. Investigate regressions in median first-visible time, warm swipe or offline search exceeding the greater of 10% or one 60 Hz frame. Repeat noisy comparisons before attributing changes to storage.

The [permanent report](../public/reports_informations/bible-offline-storage.md) records the storage consumers, fallback behavior, migration and verified release-tag dependencies. All 22 focused cache and online-search tests passed.

#### Baseline results

Galaxy A24 SM-A245F, Android 16, Chrome 158.0.8127.42. The phone ran the benchmark export in an isolated browser tab with a simulated Android bridge. Desktop Chromium provided a second control. Each row gives the observed range over three fresh documents. Heap is the retained JavaScript increase over Pray after navigating to John 4. It includes UI allocations.

| Environment | Translation | John 3 visible, ms | John 4 interaction, ms | Heap increase, MiB | Warm return to Bible, ms | Offline search, ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| A24 Chrome | KJV | 46–50 | 295–402 | 14.1–15.4 | 517–568 | 1,083–1,110 |
| A24 Chrome | AVD | 40–51 | 366–442 | 18.9–19.1 | 523–536 | 810–1,340 |
| Desktop Chromium | KJV | 19–64 | 98–106 | 14.2 | 387–401 | 819–840 |
| Desktop Chromium | AVD | 20–75 | 119–129 | 19.0 | 405–406 | 823–828 |

All twelve runs read the selected translation array once and added zero whole-translation reads across warm swipes and the subsequent search. The phone median successful interaction was 317 ms for KJV and 382 ms for AVD. These observations support prioritizing cold Bible entry and retained memory. They cannot predict an exact chapter-storage speedup.

**Outstanding device check.** The installed app uses WebView 157.0.8103.52. Its first attempt lost foreground and produced no valid timing. Automatic approval blocked relaunching it. Resume with Wasla in the foreground and repeat the matching six trials before closing Step 1.

### Step 2 — Store new translations by chapter

Use the existing localForage storage layer. Define a versioned manifest per translation containing ordered books, available chapters, verse counts and the active dataset version. Give each chapter a stable key within that version. Preserve verse IDs, order, references, language metadata and text. Define shared operations for listing installed translations, reading a table of contents, reading one chapter, replacing a download and deleting it.

Write a new download or bundled seed under a staging version, verify its contents, then publish the manifest as the final write. Keep the previous version readable throughout replacement. Account for simultaneous downloads, deletion during a write, quota errors, retries and cleanup of abandoned records. Keep the current reader working until its cutover.

**Pass when** storage tests demonstrate a single chapter read, metadata-only listing, safe replacement and recovery from interrupted writes. Stop for approval.

**Step 2 result.** New downloads and first-install AVD use versioned chapter records and a table of contents on IndexedDB. Their whole-array rollback copy is published in the same transaction. Previously installed translations stay on the original read path. Download listing reads key metadata only. Chapter reads retrieve the manifest and one chapter in one read transaction.

**Verification.** The focused suite passed 24 tests, including real IndexedDB in Chromium and WebKit using the complete 31,102-verse AVD asset. Covered sorted KJV verses and IDs, chapter-only access, metadata listing, replacement across two tabs, an injected quota error before publication, retry, and a stale install finishing after deletion. The device timing gap from Step 1 remains open. This step makes no reader latency claim.

### Step 3 — Migrate existing downloads on the device

Recognize the current whole-translation records, legacy key aliases, previous stores and retired translations. Convert one installed translation at a time in small batches, yielding during navigation. Allow reading from the original during conversion. A legacy record still needs one full read to convert it, so schedule that work outside startup and active swipes.

Verify chapter and verse counts, IDs and representative text against the source before publication. Handle low storage, app termination, retries and user deletion without restoring a deleted translation. Define when legacy data can safely be removed, including the case where an OTA rollback starts an older reader.

**Pass when** an existing download converts offline, interruption resumes or retries safely, and migration or deletion cannot leave a partial translation marked ready. Stop for approval.

**Step 3 result.** Five seconds after the first successful Bible open, schedule one idle conversion pass. It waits for historical-store import and navigation, converts installed translations sequentially, and verifies each batch before publishing the manifest. An interrupted translation restarts from its original offline array. Completed datasets are skipped. The user can delete a translation during conversion, including its historical copies. The current application and its rollback versions still require the original array.

**Validation scope.** All 26 focused tests passed, including Chromium and WebKit. The migration browser tests use a real historical IndexedDB store, an underscore alias, 40 chapters, and a retired translation. They close the page with 16 chapters staged, inject a quota error on retry, verify successful recovery and idempotence, and delete from a second tab during conversion. Device timings for migration remain part of Step 6.

### Step 4 — Read only the requested chapter

Wire the reader, pickers, Compare, presentation and Hymns Bible picker to the chapter API. Restore the saved chapter immediately when its cached translation and reference match. Keep the chapter cache bounded across translations and discard stale results after rapid switches. Preserve selection, highlights, notes, bookmarks, reading position, download state and first-install fallback. Compare should request the relevant chapter from each selected translation. Add adjacent-chapter preloading only if measurements justify it.

**Pass when** a cold open of migrated KJV reads its manifest and requested chapter with zero full-translation reads and zero AVD text reads. Verify direct entry, swipe, tap, offline return and rapid chapter or translation changes. Stop for approval.

**Step 4 result.** The reader, Compare, presentation and chat picker use chapter storage when available. The shared cache holds four chapters across translations. Array-only installs remain readable. Adjacent-chapter preloading is deferred.

**Verification.** A Chromium UI test entered the Bible URL with KJV, John 3 selected. It recorded exactly one KJV chapter payload, zero whole-array or AVD verse reads, and no extra verse reads after taps and touch swipes. Moving to John 4 and 5 read one chapter each. Switching back to KJV while an AVD read was held preserved the KJV text and saved position when that AVD read finished. Browser storage tests also cover cache eviction and cross-tab replacement. Installed-device timing remains pending.

### Step 5 — Preserve offline search

Build a searchable index per translation version independently from reader startup. Preserve Arabic normalization, existing phrase and word ranking, result limits, cancellation and online-to-offline fallback. Define how search works while an index is being built or recovered. Invalidate the index on replacement or deletion. Check work and storage costs before choosing the final index representation.

**Pass when** representative Arabic and English queries match the existing results and order, queries can be cancelled, and typing never causes a full set of chapter reads per keystroke. Stop for approval.

**Step 5 result.** Offline search uses a versioned token dictionary, lists of matching verse positions, and a compact token sequence for exact phrase verification. Opening search offline can start preparation while the user types. On the first use of a dataset version, one shared build reads its compatibility array in source order. Subsequent sessions load the persisted index. Result hydration reads at most the distinct chapters represented by the top 50 hits. Browsing alone never triggers index construction.

**Cost check.** The bundled AVD fixture contains 31,102 verses. The old normalized search strings total 8,590,106 UTF-8 bytes. The new dictionary strings and typed-array payload total 6,205,106 bytes before IndexedDB overhead. In one desktop Chromium run, searching for Nicodemus in Arabic took 421 ms including construction and publication. Five subsequent searches took 4–5 ms each, excluding the UI debounce. These measurements describe the desktop fixture; the phone comparison remains in Step 6.

**Verification.** Chromium and WebKit compare indexed results against the previous ranker, including normalization, exact phrases, substrings, repeated words, whitespace, partial matches, stable ties and the 50-result cap. Tests cover cancellation, shared construction, persistence, invalid-index recovery, low-storage fallback and replacement/deletion. A reader UI test changes offline queries and checks the displayed result and exact chapter reads. Legacy array-only downloads retain their existing search until migration publishes the chapter manifest.

### Step 6 — Verify performance and complete the report

Repeat Step 1 on the same phone and build configuration. Compare cold Bible entry, first interaction, retained memory, warm swipes, offline search and on-disk size, including peak migration space. Verify fresh install, an upgrade with existing translations, interrupted conversion, offline relaunch and translation deletion. Record web, Android and iOS coverage separately.

**Pass when** the structural read checks pass, measured results meet the Step 1 thresholds, and the [permanent report](../public/reports_informations/bible-offline-storage.md) documents the implemented schema, read paths, fallback rules, migration, rollback, tests, measurements and any device coverage gaps. Present the results for final acceptance.

**Step 6 validation.** The production benchmark export completed using the same isolated type-check exemption as Step 1. Ten fresh desktop documents verified chapter-only entry and a warm return with zero further verse reads. Median successful interaction was 57 ms for KJV and 62 ms for AVD. Both retained about 0.7 MiB above Pray. See the permanent report for timings, storage estimates, test recovery and platform coverage. The Galaxy A24 was connected and authorized but locked during the desktop trials. Final mobile acceptance and rollout remain open.
