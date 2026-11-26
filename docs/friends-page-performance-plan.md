# Friends page performance and UX implementation plan

**Status** — All seven steps complete. Ready for staged release review.

**Objective** — Make repeat visits, long lists and notification opens cheaper while keeping cached content visible, friendship actions accurate and notes available offline.

Read the [Friends system report](../public/reports_informations/friends-system.md) and [Friends notes guide](../src/app/friends/README.md) before implementation. The directory is shared with the owner’s Profile and the Pray recipient picker. The people pager also serves other users’ Profile lists. Verify those entry points whenever shared behavior changes.

## Evidence and priorities

| Audit finding | Decision |
| --- | --- |
| In an isolated store test with 100 loaded requests, a fresh return issued zero requests. After the 15-second freshness window, a return issued ten sequential list requests. Suggestions can repeat the backend mutual-friend calculation for each page. | Address refresh and cursor reconciliation first. Measure list and summary traffic separately. |
| A failed accept or cancel restores an earlier whole-list snapshot. A generic completion event also refreshes notes after unsuccessful operations. | Scope rollback and refresh to the person and outcome. Prioritize access revocation. |
| My Friends appends rows in tens. Revealing a deep notification target can mount every preceding row. | Bound rendering independently of how many names are stored offline. |
| Global discovery can briefly show an empty result before the debounce fires. My Friends empty-state guidance points to a search that only covers existing friends. | Give each search mode feedback that matches what it can find. |
| Feed visibility changes scan note state. Unstable friend-row arrays can repeat avatar cache checks. | Remove repeat work while retaining expiry, read receipts and offline assets. |

The audit passed 40 focused checks and offline search over 1,250 friends in Chromium and WebKit. These are functional results. Friends frame times on the Galaxy A24 still need a baseline. Keep the current visual design, including search and dialog styling, unless device evidence identifies a specific rendering cost.

## Step 1 — Establish the baseline and repair test coverage

- Re-run the failing Profile friendship flows individually. Update obsolete Friends notification fixtures to use current paged responses, valid IDs and the actual directory cache. Record any reproducible product failure separately from fixture failures.
- Exercise Requests, My Friends, Sent, discovery, a notification outside the first page, and return from a profile by tap and swipe. Cover a slow response, offline restart, reconnect and account switch using isolated test accounts or fixtures.
- Capture a repeatable desktop and Galaxy A24 WebView baseline for short lists, 100 previously loaded requests and a directory of at least 1,250 friends. Record API calls by endpoint, maximum mounted rows, time to show a cached row or notification target, scroll position and frame gaps. Use the same build mode, fixtures and gestures across comparisons. Run at least five timing trials per device scenario and record the median and range.

**Acceptance** — Current-contract tests exercise warm notification opening, delayed incoming requests and stale responses after accepting. The measurements distinguish network wait from rendering time. Record any unavailable device or unresolved failure before approving product changes.

### Step 1 baseline and verification

The three Friends notification tests now use account-scoped directory checkpoints, the paginated request cache, valid actor IDs and the current API responses. They passed for a cached target with a stalled backend, an incoming request while directory sync was stalled, and a stale response after accepting. The Profile setup failures were caused by English button selectors running against an Arabic page. Explicitly selecting English in those fixtures restored all ten Profile checks.

Across the focused runs, 32 distinct checks passed: ten Profile cases, three notification cases, four pagination/discovery cases, two swipe/account-switch cases and thirteen directory cases. These include return from Profile by tap, swipe traversal in both directions, offline search across a restart, reconnect removal and account isolation. Chromium and WebKit cover mobile browser behavior; the physical device run used Android.

The [measurement script](../scripts/measure-friends-page.cjs) serves the same production export to desktop Chromium and the Galaxy A24's installed WebView. Each trial uses a fresh test origin, seeded IndexedDB, and synthetic API data. Each incoming request page has a fixed 60 ms response delay. Short accounts have ten cached incoming requests and ten friends; large accounts have 100 cached requests and 1,250 friends. The script returns from Sent immediately and again after 15.5 seconds. It then opens a cached acceptance notification targeting friend 10 or 1,000.

First-row time runs from document navigation to the first sampled frame containing a row. Target time runs from notification dispatch to a second frame observing the target in the viewport. Frame gaps come from animation callbacks during the target reveal. These are renderer measurements, including measurement overhead. Live backend latency, native push delivery and OS startup require separate measurements.

Raw trials include endpoint counts, refresh cursors, final scroll positions and frame gaps. [Desktop results](../performance/friends-step1-desktop.json) · [Galaxy A24 WebView results](../performance/friends-step1-a24-webview.json)

Production web export `2.0.18`, build `dmKLon3IEi0Qg6glkpS9b`. Timings below are medians in milliseconds, with the five-trial range in parentheses. The frame column shows the longest callback gap per trial during notification reveal.

| Renderer | Friends / cached requests | First row | Target mounted | Target visible | Longest frame gap | Peak rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | 10 / 10 | 350 (220–364) | 11 (9–15) | 28 (21–30) | 17 (17–17) | 10 |
| Desktop | 1,250 / 100 | 262 (232–508) | 158 (150–298) | 196 (173–2,931) | 150 (133–283) | 1,010 |
| Galaxy A24 | 10 / 10 | 761 (672–798) | 24 (18–28) | 36 (25–43) | 30 (17–33) | 10 |
| Galaxy A24 | 1,250 / 100 | 686 (671–715) | 544 (531–575) | 9,880 (9,706–10,122) | 517 (500–533) | 1,010 |

All 20 fresh returns from Sent produced zero requests during the fresh-return observation. Each stale return with 100 cached incoming requests fetched ten sequential incoming pages plus the suggestions refresh. The notification target was already in the local directory. Step 2 should eliminate the page replay at the top of Requests. In Step 4, trace scroll position and target visibility during the reveal. The A24 target was mounted several seconds before it became visible; the measurements do not establish the cause of that interval.

**Repeating the measurement.** Run `node scripts/measure-friends-page.cjs` from the frontend directory with a production export in `out`. For Android, open the installed app and set `FRIENDS_CDP` to its forwarded WebView debugging endpoint. Set `FRIENDS_RUN` to a new label such as `step2` for comparisons so the original baseline is preserved. Each run uses five trials per account size. The test limits its storage writes to fixture origins and returns the WebView to its original URL.

## Step 2 — Refresh visible lists and counts efficiently

- Keep the selected tab, cached cards and reading anchor visible while refreshing. Reuse a fresh result; coalesce concurrent activation, resume and reconnect signals. Keep freshness and in-flight state scoped to the signed-in account and collection. Prioritize explicit retry and push invalidation.
- For a stale list, refresh the first page, retain previously visited rows provisionally, and reconcile deeper pages when the reader approaches them. Track cursor boundaries and deduplicate by stable ID. If membership or suggestion rank moves a boundary, rebuild forward from the nearest verified cursor as needed. A failed request must leave the last usable rows and retry path available.
- Give the summary a shared freshness check. Update or invalidate affected counts after mutations and pushes. Prevent late responses from replacing newer counts. Continue showing incoming requests above suggestions and loading Sent on selection.

**Acceptance** — With 100 previously loaded rows and the viewport at the top, a stale return makes at most one initial list request per visible collection and one summary request. A fresh return makes zero ordinary refresh requests. A deep return preserves its anchor. Test inserts, removals and suggestion reordering across boundaries, including a complete traversal with no skipped or duplicate people.

### Step 2 implementation and checks

- Incoming, Sent and Suggested friends now refresh the first server page and retain deeper cached cards. The continuation cursor belongs to the verified rows. As the reader approaches cached rows, the pager follows that cursor, deduplicates by ID and replaces provisional data. Reaching the final page drops rows that disappeared on the server. A failed page keeps the last usable rows and can be retried. A deep visit can still need several sequential requests to reach the visible position.
- Counts use the account-scoped session GET cache with a 15-second freshness window. Tab activation, reconnect and resume reuse in-flight reads. Friendship notifications invalidate both counts and list freshness even while Friends is unmounted. Older responses cannot replace newer confirmed reads.
- Request and suggestion lists preserve the visible card across a reorder. The regression test inserts a new incoming request above row 75 and checks the card's viewport position within two pixels on Chromium and WebKit. The paging test also exercises removal, insertion, a suggestion moving across pages, an offline failure, retry and complete traversal.
- Search, the local friend directory, Profile lists and Pray’s recipient picker continue to use their existing paging modes. Opening a deep notification can still mount a large number of cards. That issue belongs to Step 4.

**Measured result.** All 20 immediate returns made zero requests. In every large-account trial (five desktop and five A24 WebView), the stale return at the top of Requests fetched one incoming page, down from ten, plus one suggestions page and one count summary. Deeper pages were fetched as needed during the separate anchor check. The production build, lint on changed application modules and 27 focused paging, notification, directory, Profile and Pray checks passed. The device comparison used the isolated fixture and synthetic API delays described in Step 1. [Desktop trials](../performance/friends-step2-desktop.json) and [Galaxy A24 trials](../performance/friends-step2-a24-webview.json).

## Step 3 — Make friendship actions safe under concurrency

- Track pending operations by person. Apply and undo only the affected request, relationship and count. Keep feedback immediate and disable duplicate actions on the same person while allowing actions on others.
- Reconcile the server’s confirmed outcome, including crossed requests that become an acceptance. Ignore obsolete responses after newer actions, logout or account switch. If a response is lost after submission, verify the relationship before settling an ambiguous result.
- Refresh affected lists and counts once. Recheck note access on confirmed friendship changes and authoritative access events. Preserve prompt removal of revoked content and normal retry behavior.

**Acceptance** — Accept Alice and Bob, fail Alice’s request, and verify Bob stays accepted. Repeat with cancel, remove, crossed requests, concurrent push and delayed reads. A failed send causes no unrelated feed refresh. A successful removal still revokes access and reconciles the local directory.

### Step 3 implementation and checks

The Friends page tracks pending writes by person within the authenticated directory session. Rows, buttons and counts show the intended result immediately. A rejected write drops only that person's pending change. The confirmed directory and offline request cache receive confirmed outcomes. Count refreshes that arrive during overlapping actions wait until the group settles.

A crossed add can resolve as an acceptance. After an ambiguous response the client reads that person's relationship before settling. If verification also fails, the page reports uncertainty, releases the pending button and invalidates cached reads for reconciliation. A lost response never triggers an automatic repeat of the write. Session changes suppress late outcomes.

Confirmed membership changes refresh note access. Removing a friend filters that author's downloaded notes from an already-loaded feed while its refresh is pending. Ordinary sends and cancellations leave the feed alone. The existing authoritative access events still handle remote revocations.

Verified with synthetic accounts and controlled API responses. The production-export browser checks accepted two requests concurrently, confirmed Bob first, rejected Alice and verified both the badge and My Friends. A separate check counted zero extra note-feed reads for a rejected send and one for a confirmed removal; another friend's note remained visible during that delayed refresh. Store tests cover overlapping cancels and removals, duplicate submissions, lost responses, push ordering and logout. No live friendships were modified.

## Step 4 — Bound list rendering and open notification targets directly

- Use Step 1 measurements to choose the smallest rendering change. Start with My Friends and deep notification targets. Evaluate the existing Pray list-window approach against Friends row heights, separate sections and focus behavior before reuse.
- Keep logical paging in tens and retain local name search. Use the local directory or existing targeted endpoint to locate a person without rendering every earlier row. Handle a withdrawn request, a removed friend and an offline target that was never downloaded.
- Preserve the scroll anchor, keyboard focus, screen-reader access, Show more, avatar viewer and profile return position. Keep enough rows above and below the viewport for quick flings and reversals.

**Acceptance** — Opening a target around position 1,000 lands on the correct person with mounted rows bounded by the viewport and overscan. Doubling the directory size does not double mounted rows. Full traversal still reaches every row, including by keyboard. Verify small lists and both notification entry paths (cold launch and already-open app).

### Step 4 implementation and checks

My Friends keeps local paging in tens. A notification can reveal a later batch directly. Its fixed-height, single-line cards use document scrolling with one extra viewport of cards above and below. This preserves the scrollable height and avoids mounting the intervening avatars. A focused card stays mounted, and each list item exposes its position and total to assistive technology. Returning from a friend's profile restores the selected row and search within the same account.

Cold and warm notifications use the local directory first. A missing person triggers a targeted lookup when online. A withdrawn request or missing offline entry shows feedback and leaves the list usable. Incoming requests retain their existing server pagination.

| Warm notification for person 1,000 of 1,250 | Step 1 median time visible | Step 4 median time visible | Step 4 peak My Friends cards |
| --- | ---: | ---: | ---: |
| Desktop Chromium, mobile viewport | 196 ms | 34 ms | 30 |
| Galaxy A24, installed WebView | 9,880 ms | 53 ms | 30 |

Each median covers five trials on an isolated fixture origin with synthetic data. The earlier runs peaked at 1,010 cards. These timings measure notification delivery to a visible target on an open page. [Desktop measurements](../performance/friends-step4-desktop.json) and [Galaxy A24 measurements](../performance/friends-step4-a24-webview.json).

The production-export checks covered cold and warm deep links, full scroll traversal of 1,250 and 2,500 names, keyboard traversal across window boundaries, profile return position, withdrawn requests and unavailable offline targets. Eight shared directory, paging, Profile and Pray checks passed, including offline search in Chromium and WebKit. The production build and lint on the changed application modules passed.

## Step 5 — Correct search feedback and relationship display

- Model discovery as waiting for input, waiting for the matching request, results, empty or error. Only show “No users found” after a successful response for the current normalized query. Handle rapid typing, clearing, closing and switching tabs while requests are in flight.
- Keep My Friends search local, including Arabic, multiword names, diacritics and leading `@`. Distinguish a complete directory with no match from incomplete offline preparation. Direct users who want to add someone to online discovery.
- Compute suggestion visibility once per relevant change. Avoid repeated list scans per result, and ensure stale search metadata cannot override a confirmed local friendship action.

**Acceptance** — Typing in My Friends makes zero search requests. Under slow discovery, the user sees neither a false empty result nor another query’s matches. Send, accept and cancel update the visible action correctly without requiring the user to retype.

### Step 5 implementation and checks

Discovery starts after two username characters and a 300 ms pause. It shows a searching state during that pause and the initial request. Results, paging, errors and retry belong to the current normalized username. Clearing the field, closing search or selecting My Friends removes the discovery panel immediately. A successful empty response displays the no-match message.

My Friends filters the saved directory on the device. Its empty state distinguishes a complete search from a search over the entries saved so far and points users to Requests for online discovery. Sending, cancelling or accepting a request updates the existing search results. A confirmed write avoids a redundant search refresh. Suggestions use one filtered list and retain the original server indices for paging.

The production build and lint passed. Four production-export browser tests and eleven action and paging tests passed using fixture accounts. The browser checks included out-of-order responses, retry after failure, send/cancel/accept without retyping, and offline multiword search with accented Latin and Arabic text. The offline search issued zero discovery requests.

## Step 6 — Reduce note and avatar work on tab switches

- Avoid publishing a new feed snapshot just because the tab changed when there is no expiry or data change. Recheck actual deadlines on resume. Preserve off-page unread indicators, note-specific read receipts, server access checks, live deletion and the 24-hour offline expiry.
- Stabilize visible friend-row selections and avatar prefetch inputs. Schedule checks for newly relevant or changed photos, retaining existing offline, data-saver, concurrency and retry behavior. Measure repeated storage reads separately from network downloads.
- Check preview sizing, horizontal rail position, the composer, reader, loves sheet and owner actions. Keep the shared Profile note behavior covered.

**Acceptance** — Repeating an unchanged warm tab switch causes no visibility-only full-feed recalculation or repeat prefetch scan of unchanged rows. Offline notes still open and expire at the original deadline; deletion and friendship revocation reconcile on reconnect. Opening Friends alone never marks a note seen.

### Step 6 implementation and checks

The authenticated feed remembers its next expiry. Returning to Friends checks the deadline. Before it is due, the store retains the same snapshot and timer. Reopening the app still reconciles access with the server. A note becomes seen only when opened. The Friends board uses the feed's expiry-filtered items directly, and Profile continues to use its permanent collection.

Incoming and sent requests schedule avatar prefetch independently when their row selections change. A bounded map tracks successfully checked photo URLs. A changed URL or cache eviction makes the photo eligible again. Failed checks can retry, and a change to the disk index in another browser tab invalidates the remembered checks. Photo bodies stay in the existing device or browser cache.

In an instrumented store test, 100 unchanged hide/show cycles produced zero subscriber notifications and zero replacement timers. In the avatar prefetch test the initial uncached photo required one storage read and one download. The next 100 submissions of the same photo added zero storage reads and zero downloads. These counts cover background prefetch; a newly mounted avatar still reads its saved image to display it.

Forty focused store, storage, preview and prefetch checks and twelve production-export browser scenarios passed. The browser checks covered rail position, unread indicators, composing, reading, the Loved by sheet, owner editing, offline restart, expiry, reconnect, deletion and access revocation. The browser coverage used Chromium and Playwright WebKit. Physical-device comparison is scheduled for Step 7.

## Step 7 — Compare results and update the maintenance reports

- Repeat Step 1 with matched fixtures, device, build mode and gestures. Compare request counts, mounted rows, cached-row and target latency, frame gaps and scroll restoration. Investigate a repeatable regression before recommending release. Report noisy or unavailable measurements explicitly.
- Run the production build, focused unit and integration tests, and Chromium and WebKit flows. Exercise Friends, both Profile views and Pray recipient selection. Recheck offline restart, push delivery, account isolation, keyboard navigation and swipe return.
- Record measured results and final refresh, cursor, mutation and notification rules in the Friends system report. Update the notes guide for any feed or avatar lifecycle changes. Identify the affected release components from the actual diff.

**Acceptance** — Publish a before/after table with test outcomes, remaining limitations and release recommendation. Completion of this plan ends at release review. Deployment is a separate decision.


### Step 7 release review

Matched production exports ran in the same desktop Chromium version and installed Galaxy A24 WebView version as Step 1. Each cell gives the median of five trials per account and renderer, with the observed range in parentheses. Times are milliseconds. The open-page notification targeted person 10 or person 1,000. The first-row clock starts at document navigation.

| Renderer and fixture | Run | First cached row | Target mounted | Target visible | Worst frame gap per trial | Peak mounted rows |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Desktop, 10 friends | Before | 350 (220 to 364) | 11 (9 to 15) | 28 (21 to 30) | 17 | 10 |
| Desktop, 10 friends | Final | 387 (342 to 414) | 13 (13 to 18) | 26 (23 to 33) | 17 | 10 |
| Desktop, 1,250 friends | Before | 262 (232 to 508) | 158 (150 to 298) | 196 (173 to 2,931) | 150 (133 to 283) | 1,010 |
| Desktop, 1,250 friends | Final | 435 (378 to 469) | 24 (22 to 27) | 44 (41 to 47) | 33 (17 to 33) | 100 |
| Galaxy A24, 10 friends | Before | 761 (672 to 798) | 24 (18 to 28) | 36 (25 to 43) | 30 (17 to 33) | 10 |
| Galaxy A24, 10 friends | Final | 714 (694 to 867) | 31 (28 to 33) | 41 (38 to 56) | 33 (17 to 50) | 10 |
| Galaxy A24, 1,250 friends | Before | 686 (671 to 715) | 544 (531 to 575) | 9,880 (9,706 to 10,122) | 517 (500 to 533) | 1,010 |
| Galaxy A24, 1,250 friends | Final | 715 (674 to 799) | 43 (39 to 47) | 55 (49 to 59) | 50 (50 to 83) | 100 |

All 20 immediate returns reused the people lists and counts. One desktop short-account trial recorded a testimony request during that interval. All ten large-account stale returns fetched one incoming page, one suggestions page and one summary. The original large-account runs fetched ten incoming pages each. A fresh tab return and a push-triggered invalidation are separate events.

The final large-account peak of 100 rows occurs on Requests, which retains the cached incoming cards. During the notification jump, My Friends peaked at 30 rows on both renderers. All ten large-account jumps reached person 1,000. Per-trial scroll positions and frame gaps are included in the [desktop measurements](../performance/friends-step7-desktop.json) and [A24 WebView measurements](../performance/friends-step7-a24-webview.json).


**Entry latency investigation.** The large-account first row was slower in the historical comparison. We rebuilt the pre-plan frontend from commit `1c3ecef` with the same dependencies and build settings, then alternated the two exports across six fresh-origin pairs per renderer. Both versions went first three times. Median first-row time was 228 ms before and 212.5 ms after on desktop, and 726 ms for both on the A24. The historical slowdown did not repeat consistently. This includes document and script loading. To repeat, set `FRIENDS_ENTRY_BASELINE` to the pre-plan export directory and use a distinct `FRIENDS_RUN` label. [Desktop entry pairs](../performance/friends-step7-entry-desktop.json) and [A24 entry pairs](../performance/friends-step7-entry-a24-webview.json).

**Regression checks.** The production export built successfully. All 102 focused checks passed, comprising 68 directory, cache, paging, note, avatar and related checks, 17 shared Friends/Profile/Pray browser checks, 10 notification/search/anchor checks, two swipe and account-switch checks, and five offline-note, reconnect and rail checks. Chromium and WebKit retained the same incoming card within two pixels after insertion above it. Profile Back restored the selected friend within four pixels. Traversal and keyboard checks covered directories of 1,250 and 2,500 people.

**Release recommendation.** Proceed with a staged web and OTA rollout for installations that already support the current people and directory APIs. This performance diff changes frontend JavaScript, tests and documentation. It requires no backend migration or Android/iOS rebuild. The measurements used isolated accounts, synthetic responses and an Android WebView with the native bridge disabled on fixture origins. Socket and notification routing were exercised with fixtures. Native startup, live push delivery, physical iOS behavior and production latency remain outside these measurements. The A24 entry diagnostic also logged a NativePurchases bridge warning. Billing was outside this Friends review. No release was deployed.
