# Android swipe latency on the Galaxy A24

**Status** — On 19 November 2026, testing on the Galaxy A24 identified backdrop filtering inside the moving pages as a contributor across all four tabs. The shared pager now simplifies those surfaces during Android swipes. The measurements below use the installed 2.0.3 build as the control. Earlier 2.0.2 results are retained for context.

## Same-phone comparison on 2.0.3

Android FrameTimeline captured 12 swipes in phone Chrome, 24 in the installed app and 24 in the final production candidate loaded into the same WebView. Each pass used 240 ms horizontal gestures from Pray to Bible to Friends to Profile and back, twice. Every swipe reached its target. The table counts intervals over 25 ms among all intervals measured in each window. Different counts reflect the frames actually presented.

| Approximate window | Phone Chrome | Installed app | Updated app |
| --- | ---: | ---: | ---: |
| Drag, final 200 ms of input | 8 / 85 | 24 / 146 | 3 / 176 |
| Settle, first 160 ms after input | 14 / 81 | 34 / 158 | 4 / 197 |
| Handoff, following 240 ms | 20 / 106 | 63 / 191 | 40 / 219 |

In the updated app, the 95th percentile during dragging and settling combined was 22.4–22.6 ms in each of the six directions. The corresponding figures in the installed app were 33.6–33.8 ms. During handoff the overall 95th percentile fell from 67.1 to 56.1 ms, close to Chrome's 55.9 ms. Both app builds had a worst handoff interval of about 101 ms. Once motion finishes, the display can also go longer between presentations while content is static. These late intervals alone do not establish a visible stall.

Reapplying the original styling between experiments brought back the slower frames. The pager now turns off decorative backdrop filters on hidden and moving Android tab panels and restores the active page's styling after a commit or cancellation. This targets background sampling on cards, the reader and controls. Prayer text privacy uses a separate filter. A memoized page boundary also lets pager preparation updates skip rendering a mounted page whose inputs have stayed the same. Activity, selection and page data still propagate to subscribers.

The installed OTA bundle was restored after testing. These figures describe one Galaxy A24 and its current account data.

## Device evidence

On the Galaxy A24 (SM-A245F), Wasla 2.0.2 completed all 12 swipes in two round trips through Pray, Bible, Friends and Profile. Each destination had a content-ready marker before the gesture. Some drags had 33–67 ms between WebView animation callbacks. Entering Friends from Bible produced gaps of 150 ms and 133 ms on successive visits. A separate trace around the same handoff showed a 112 ms main-thread task with roughly 30 ms spent updating styles and layout. Several animation callbacks followed it. These timings locate the stall. The responsible components still need attribution. Callback intervals and frames actually presented by Android are distinct measurements.

## 1. Identify what runs during each late frame

Repeat the same route sequence on the installed phone with the same account data. Separate a first visit after opening the app from repeat visits. Mark finger down, first panel movement, release, route commit, swipe cleanup and the first 500 ms after cleanup. Compare a bottom-tab tap into Friends from Bible as a control. Capture timing runs without screen recording, then record a separate visual pass. Log timings and counts only.

Use the WebView performance trace to identify the owners of long tasks, layout reads, animation callbacks and image decodes. If minified stacks are ambiguous, add temporary timing marks around the pager, Friends hooks and note fitting in a local profiling build. Use Android FrameTimeline or SurfaceFlinger data to check whether long WebView intervals coincide with missed display frames.

**Gate** — Reproduce both the drag and handoff symptoms. Record a baseline by direction and phase, and identify the largest repeatable cost with a trace or a controlled on-device comparison.

### Step 1 results on the Galaxy A24

Captured Android SurfaceFlinger FrameTimeline without screen recording, using Wasla 2.0.2 in the installed app and phone Chrome. Each run used two round trips through the four tabs with 240 ms injected swipes. For the app activity layer and Chrome content surface, associated each submitted buffer with its display frame and measured the intervals between presentations. The settle sample includes intervals wholly inside the first 160 ms after the input command returned. The window is approximate and omits gaps that cross its boundaries.

| Initial paired runs, 12 swipes each | App | Chrome |
| --- | ---: | ---: |
| Median interval between presentations during settling | 22.4 ms | 22.4 ms |
| Intervals longer than 25 ms during settling | 18 of 79 | 8 of 67 |
| Longest sampled interval during settling | 44.8 ms | 56.0 ms |

In subsequent app runs, the original styling produced 3 long intervals out of 73. Temporarily disabling both navigation bars' blur produced 3 of 71 and 9 of 88 in two runs. Disabling only the header produced 14 of 87 and only the bottom bar produced 11 of 88. These overlapping results do not establish a reliable blur benefit. Preserve the existing appearance. For further shared-motion experiments, interleave control and candidate runs, compare each route separately, and track display refresh rate.

**Attributed handoff cost.** The Bible → Friends renderer trace identified a forced layout inside `fitNotePreview`, plus repeated animation-frame callbacks from `TestimonyCard`. In a separate attribution pass, counting the style reads at the start of the fit routine and grouping by owning pager panel found **30 calls across 10 distinct note previews**, all in the inactive Profile panel, from the swipe through 650 ms after Friends opened. Friends had become adjacent to Profile. These measurements establish a contributor to the hitch. They do not account for the entire React commit or for gaps on other routes.

**First implementation experiment.** Gate compact note fitting and its resize/font subscriptions on the owning pager panel being active. Keep readable preview text when a panel is inactive and preserve a previously fitted result while its inputs remain valid. Make an activated card eligible for fitting only once for a given text, font state and size. Re-run the same probe and verify zero fits on hidden Profile during Bible → Friends, correct wrapping when Profile opens, and a smaller handoff stall on the A24. Continue the shared-motion investigation separately if settling still feels heavy.

### Hidden Profile note fitting ? implemented and verified

Only the selected pager panel subscribes to compact note resizing and font completion. A hidden card retains its previous fit or uses the existing CSS clamp until first selection. Visible cards reuse the previous fit when text, available dimensions, author layout and font readiness are unchanged. Routes outside the pager fit normally.

On the same Galaxy A24, three warmed Bible ? Friends swipes on the installed build each performed 30 hidden fits across 10 Profile notes. Three swipes with the production candidate temporarily loaded in the same WebView each performed zero hidden fits with all 10 notes mounted. All 10 notes had a measured font size and line clamp when Profile opened. The longest animation-callback gaps in the gesture and 650 ms observation window were 133, 150 and 133 ms on the installed build, and 50, 50 and 50 ms with the candidate. These are WebView callback measurements from a small sample. Display-frame verification across other routes remains pending. The original packaged assets were restored after testing.

## 2. Reduce work during dragging and settling

Measure the finger-down phase and the interval immediately after release separately. Across 12 matched swipes per client on the A24, Wasla 2.0.2 had 23 animation callback gaps above 32 ms during settling in the app and five in phone Chrome. Friends → Profile and Bible → Pray also showed longer gaps in the app. All destinations already had a content-ready marker. Treat the shared motion cost separately from the additional Bible → Friends activation cost seen in both clients.

Inspect the first drag frame in `PrimaryTabPager.jsx`, where the pager measures and crops the two panels. Check for a forced layout or a layer larger than the viewport. The movement handler already updates two transforms. Preserve that path. If the trace points to paint or compositing, test the header and bottom-bar backdrop blur individually during motion on the A24. Keep a change only if it improves frame delivery and preserves the appearance after settling.

**Gate** — Repeat slow drags, short flicks and cancellations. Compare frame intervals and missed display frames against Step 1. Check scroll position on a long page, vertical scrolling, gesture sensitivity and reduced motion.

## 3. Remove the hitch when Friends becomes active

Trace the boundary between pager cleanup, React's route commit and the next visible paint. Inspect these specific candidates:

- `TestimonyCard.jsx` fits note text on mount, resize and font readiness. `fitNotePreview.js` changes font styles and reads text height. If the same card is measured repeatedly with identical inputs, reuse the previous fit and schedule a new measurement only when text, dimensions or fonts change.
- `friends/page.jsx` activates summary, request, suggestion and local-directory hooks. Measure their render and publication costs separately from network latency. If several refreshes rebuild the visible list during settlement, keep the cached section visible and coalesce nonurgent updates. Preserve notification targeting and immediate responses to user actions.
- The pager changes the set of mounted neighbors on route commit. If mounting a neighbor competes with the incoming page's first paint, defer the expensive neighbor work and cancel it on a new gesture.

Apply and measure one change at a time. Extend a proven fix to Pray, Bible or Profile only where their traces show the same cost. Inspect the first half-second after settling so that moving a stall a few frames later cannot count as a fix.

**Gate** — Repeat Bible → Friends with notes and with an empty feed. Check Friends → Bible, saved reading position, Pray draft, cached offline content and rapid reversals. Confirm fresh data still appears after settling.

## 4. Verify the candidate on the phone

Compare the release candidate with 2.0.2 on the same A24, refresh-rate setting and data. Collect at least ten warm Bible → Friends swipes per build and several complete round trips. Record cold visits separately. Report the p95 and worst frame interval, count of gaps over 50 ms and 100 ms, and Android missed-frame counts by phase. Compare screen recordings for visible pauses.

**Proposed acceptance targets** — Zero gaps above 100 ms on the ten warm Bible → Friends swipes, fewer missed frames during dragging than the matched baseline, and no repeatable post-settle hitch. Every accepted swipe must add one history entry. Cancellations must preserve the tab and scroll position. Cached returns must expose real content throughout. Run the Chromium and WebKit gesture, tap and Back regressions. Record any missed target explicitly before release.
