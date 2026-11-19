# Primary tab navigation and startup performance plan

**Status:** All six steps have been run in the browser (19 November 2026). Cached return swipes passed. Fresh startup missed its provisional target by 2 ms. Physical-device release signoff is pending.

**Execution rule:** Start only the numbered step requested by the user. After each step, record its changes, checks, results and any remaining uncertainty here. Stop and wait for the user's command before starting the next step. If a check fails, resolve it within the current step or report what blocks it.

## Outcome

Opening Wasla should prioritize the first usable screen. A return swipe between Pray, Bible, Friends and Profile should reveal recognizable content from the first visible frame and settle on the same view. Taps, canceled drags, back navigation, offline use and account switching must remain predictable.

## Evidence and scope

Compare the Wasla swipe recording in `public/problems/Recording_20261119_041241.mp4`, the tap recording in `public/refrence_performance/tap_from navbottom.mp4`, and the interaction reference in `public/refrence_performance/Recording_20261119_040927.mp4`. The last recording provides a visual target. WhatsApp's internal implementation is unknown.

`PrimaryTabPager.jsx` can expose a placeholder as soon as its panel exists. Preparation pauses during a gesture, only nearby panels stay mounted, and a loaded module can still render a reader or list placeholder. Bottom-nav taps skip the drag preview. Separately, early route prefetch, neighbor imports and app-wide startup tasks can overlap. Their contribution to launch latency needs measurement.

## Step 1 — Reproduce and measure

- Record the device, build mode, account/cache state and starting tab. Compare a cold process with saved data, first setup with empty storage, and a warm return. Use a release build on a phone for timing whenever available.
- Measure launch to first app content and launch to a responsive Pray textarea separately. Repeat under the same conditions and record the median and range. Trace route prefetch, module evaluation, local reads and main-thread stalls against those milestones.
- Exercise tap and swipe on the same routes. Include Bible → Friends → Profile → Friends → Bible, an immediate first swipe, a canceled drag and rapid reversals. Check document navigation, component mounts, page-level fallback, reader-level fallback and frame timing to distinguish the causes.
- **Gate:** Produce a baseline table and recording or trace identifying which layer first shows the placeholder. Record provisional performance targets from this baseline. Label browser-only results if a phone is unavailable.

## Step 2 — Prioritize the opening screen

- Inspect `BottomNav.jsx`, `PrimaryTabPager.jsx`, the root layout and the startup tasks identified in Step 1. Schedule optional preparation after the opening screen becomes usable. Preserve authentication, offline navigation and any required initialization.
- Coordinate route prefetch and neighbor preparation. Prepare one likely destination at a time and yield to input. Avoid mounting all four tabs at launch.
- **Gate:** Repeat the Step 1 launch measurements. Show that the identified optional work has moved off the critical path, check early taps and immediate swipes, and compare time to usable input.

## Step 3 — Restore enough content for a real preview

- Define visible readiness for each tab. Pray needs its composer and available saved rows. Bible needs the current chapter and available verses. Friends needs the current section with saved content or a known empty state. Profile needs the correct account header and available summary.
- Reuse existing local data and session state. Preserve the reading position, selected tab/filter, draft and scroll position where applicable. Keep nearby views within a measured memory budget. Restore distant views from lightweight state on demand.
- Distinguish a genuine first visit, a known empty result and an interrupted load. Reset account-specific previews on logout or account switch. Check that inactive previews do not trigger repeated fetches, audio, polling or list measurement.
- **Gate:** Move two tabs away and back, online and offline. Verify the restored first screen and its identity. Check memory and mounted rows across repeated cycles.

## Step 4 — Connect visible readiness to the gesture

- Use the Step 3 readiness signal in the pager. A ready destination follows the finger and becomes the active view on commit. Preserve the same content through the final animation frame and route change.
- For an unprepared destination, keep the current screen coherent during the drag. On confirmed intent, prepare the destination and complete navigation once. Keep loading feedback scoped to genuinely missing content and provide an exit on failure.
- Preserve gesture thresholds, native edge exclusions, vertical scrolling, input controls, overlays and reduced motion. Cancellation, resize or an intervening tap must release held work and invalidate stale navigation.
- **Gate:** A recorded return swipe shows zero full-page skeleton frames when saved content is available. Confirm one history transition on commit, none on cancel, and no jump in the source scroll position.

## Step 5 — Verify taps, swipes and back navigation together

- Compare the gesture commit path with `useTabNavigation.js`. Align destination selection, restoration and history behavior wherever the traces show divergence. Preserve the existing service-worker fallback.
- Exercise fast tap → swipe, swipe → tap, back during settlement, disabled swiping, a failed import, offline launch and account switching. Check the correct tab highlight, focus, scroll position and draft after each transition.
- Extend `tests/primary-tab-swipe.browser.cjs` or the closest existing suite for concrete regressions. Assert recognizable destination content during a drag and after settlement. A successful URL change alone is insufficient.
- **Gate:** Run the relevant navigation and affected feature tests, lint and production build. Record results and any device-only checks outstanding.

## Step 6 — Compare release performance and close

- Repeat the Step 1 scenarios on the same device and build configuration. Compare launch timings, visible placeholder frames, dropped frames, memory after repeated swipes and network requests per return. Include the slowest reproducible case.
- Confirm both a returning user with data and a genuinely cold destination. Verify the visible tab remains responsive while background preparation runs.
- **Gate:** Publish the before/after table here. Mark each target passed, failed or unverified. Keep physical-device signoff pending if only browser measurements are available. Report release readiness to the user.

## Progress record

| Step | Status | Evidence |
| --- | --- | --- |
| 1. Baseline | Complete in browser | Measurements and gesture trace below |
| 2. Startup | Complete in browser | Startup route requests reduced to four. See measurements below. |
| 3. Content restoration | Complete in browser | Eviction, offline API and repeated-cycle checks below |
| 4. Swipe handoff | Complete in browser | Ready, cold, cancellation and history checks below |
| 5. Navigation regression checks | Complete in browser | Mixed input, Back, recovery and session checks below |
| 6. Release performance comparison | Complete in browser | Final timings, swipe samples and device limitations below |

### Step 2 results — 19 November 2026

BottomNav now disables viewport prefetch for its four links and no longer requests every route on mount. On swipe-enabled devices PrimaryTabPager waits for the visible page to commit inside its Suspense boundary, then schedules neighboring module preparation during idle time, one neighbor at a time. It prefetches that neighbor's route when a compatible service worker is ready. Input and navigation can occur before idle preparation runs. The commit signal indicates the page has rendered; individual sections can still be loading.

Repeated the Step 1 Chromium production-export protocol, five fresh contexts and five reloads. Median first contentful paint was 76 ms fresh (72–88) and 52 ms on reload (48–60). Median time to fill Pray was 261 ms fresh (249–270) and 166 ms on reload (150–181). By that milestone, all runs had four completed route-payload requests, down from 11–13. The fresh input median exceeded the provisional baseline by 4 ms, within the earlier range. There is no demonstrated launch-latency improvement. A physical-device comparison remains outstanding.

The tap sequence through Bible, Friends and Profile retained the document. All eight targeted Chromium/WebKit gesture checks passed, including immediate cold swipes, prepared drags and cancellation. Targeted lint and production build passed.

### Step 1 results — 19 November 2026

Production static export, headless Chromium, iPhone 13 viewport/touch emulation on Windows, localhost and mocked API responses. ADB reported zero attached devices. Five independent signed-in browser contexts started at Pray with empty app databases; each was then reloaded in the same context after 700 ms. Authentication and the splash-version preference were seeded. Timings run from document navigation to first contentful paint (any app content), and to completion of a Playwright fill of the active prayer textarea. The fill is a functional upper-bound measurement that includes automation overhead. These runs share a browser process and do not measure APK launch, native file hydration, a large journal or onboarding.

| Condition, five runs each | First contentful paint, median (range) | Textarea accepted input, median (range) |
| --- | --- | --- |
| Fresh signed-in context | 80 ms (68–240) | 257 ms (256–386) |
| Same-context reload | 48 ms (48–52) | 167 ms (163–169) |

At the input milestone the resource timeline already contained 11–13 completed requests with a Next route payload query (`_rsc`). No long task was observed by the buffered observer by that milestone. Early route traffic overlaps startup; the baseline does not attribute a specific delay to those requests, module evaluation or local storage. Compare scheduling under the same conditions in Step 2 before assigning cause.

**Gesture trace.** A tap from Pray opened Bible, then trusted Chromium touch events navigated Bible → Friends → Profile → Friends → Bible. With idle warming deliberately withheld to reproduce an immediate swipe, all four incoming panels had `data-tab-ready=false` and a skeleton directly inside `.primary-tab-content` during the drag. The document identifier was identical throughout. Thus the pager itself can supply the first visible placeholder, before the Bible reader renders. In a control starting directly on Bible, the final Bible panel was ready during the drag. The glitch depends on preparation history. In the ordinary tap run the Bible panel count across those five destination visits was 1, 1, 0, 1, 1, confirming eviction on Profile.

**Controls and targets.** Eight existing Chromium/WebKit browser cases passed across cold previews, prepared previews, repeated cancellation and short drags. For Steps 2–6, target zero page-wide skeleton frames on returns with saved content, one route commit per completed swipe and zero per cancellation. Compare at least five comparable launch runs; use 257 ms fresh and 167 ms reload as provisional browser median ceilings, allowing for run-to-run variation. Establish a separate phone target from an actual release-device trace. Real-device frame pacing, native startup costs and attribution of individual script/storage tasks remain unmeasured.

### Step 3 results (content restoration)

The pager remembers which of its four tabs have been visited. When a visited tab becomes adjacent again, it can render immediately from the existing Pray session, Bible chapter cache, Friends stores or account-specific Profile cache. The active panel and its immediate neighbors still bound the mounted page trees. Small per-tab records keep the Friends section, Bible chapter/translation and reading offset, and document scroll position. The authenticated session key scopes this memory to the signed-in account. First visits still use Step 2 preparation.

Content markers distinguish a mounted composer, resolved Friends section, identified Profile header and Bible reading content from the pager's module-ready flag. The gesture controller will consume readiness in Step 4. Bible preview restoration uses the saved chapter while inactive and leaves translations, notes, books and chapter refresh work for activation.

The eviction regression starts with a saved chapter, disables idle warming, visits all four tabs, blocks API requests, and repeats three navigation cycles. It checks 60 verse rows, a 320-pixel reading offset, the selected My Friends section and a maximum of three mounted panels. In one Chromium run, used JS heap after explicit garbage collection measured 25.9, 26.3 and 26.5 MiB across those cycles. These are browser measurements with fixtures, not native memory or long-session leak measurements. The API-offline test uses the locally served app bundle. Physical-device verification remains open.

### Step 4 results (swipe handoff)

At gesture start the pager samples the incoming panel's content marker. Ready panels track the finger using the existing transform animation. A cold panel stays outside the viewport. Canceling leaves the source in place. A committed cold gesture releases the navigation-work hold, prepares the incoming page and watches for content or a recoverable error. The route switches once. If preparation takes longer than 1.2 seconds, navigation proceeds so that the destination can show its normal loading or error UI. A new tab tap, browser history change, resize or cleanup cancels outstanding handoff work.

Chromium and WebKit checks cover the offscreen cold placeholder, a single history entry on commit, and the mounted ready Profile preview. Repeated cached Bible return drags with API requests blocked confirmed the incoming panel followed the finger with zero skeleton elements and cancellation preserved history length. Tapping the current tab during a pending cold handoff left the URL and history unchanged. Physical-device frame timing remains a Step 6 check.
Verification caveat: the production build and targeted lint passed. The final full browser run passed 26 of 27. Chromium's trusted-drag case timed out intermittently and passed on an isolated rerun. Short-flick cases also timed out in an earlier full run and passed in the final one. Gesture timing stability remains open for Step 5.

### Step 5 results (navigation regression checks)

A committed swipe or browser Back invalidates an earlier bottom-tab selection that is waiting for service-worker control. A bottom-tab tap cancels outstanding swipe work. When the swipe already dispatched a Next push, tapping the currently displayed route also issues a superseding navigation. Both entry points retain the existing worker and native document fallback.

Regression coverage includes tap-then-swipe with delayed worker control, tap during a cold handoff, Back during settlement, draft restoration, selected tab highlight, disabled interior swiping with edge Back, focus outside inert panels, API-unavailable startup with the local app bundle, logout, and restoring a second authenticated account. Existing tests cover delayed route payloads, worker failure and explicit recovery from a failed feature import. The offline check simulates unavailable APIs; the browser still serves the packaged assets.

The trusted-drag test now starts at the Friends heading, away from the notes carousel that handles its own horizontal gestures. The velocity test freezes browser time between events so only the specified input intervals determine the result. All three timing-sensitive cases passed four consecutive runs. Updated native Back fixtures provide the filesystem operations used by prayer storage. Tap and logout fixtures select the current navigation destinations and controls.

Verification: 27 navigation unit checks; 31 primary-swipe and prayer-navigation browser checks plus two additional offline/account scenarios; 21 Android/iOS Back and logout browser checks; seven targeted tab-routing/recovery checks; one IndexedDB account-isolation check. Production export and targeted ESLint passed. Native Back and gestures were exercised in browser fixtures. Release-device feel, performance and final before/after comparison belong to Step 6.

### Step 6 results (19 November 2026)

Repeated the Step 1 launch protocol against the final production export on the same Windows host. Times below are medians with the observed range across five runs per condition.

| Browser measurement | Step 1 | Final | Assessment |
| --- | --- | --- | --- |
| Fresh Pray accepts input | 257 ms (256–386) | 259 ms (253–287) | Failed the provisional 257 ms ceiling by 2 ms. The ranges overlap. |
| Reloaded Pray accepts input | 167 ms (163–169) | 164 ms (161–210) | Passed the 167 ms median ceiling. |
| First contentful paint, fresh / reload | 80 / 48 ms | 76 / 48 ms | Descriptive. This measures first paint before input readiness. |
| Completed route payload requests by first input | 11–13 | 4 every run | Passed the startup traffic reduction target. |
| Page-wide placeholder on a saved-content return | Skeleton present during the baseline return drag | Zero visible samples containing the full-page skeleton | Passed in the sampled browser gestures. |
| History on swipe commit / cancel | Target +1 / 0 | +1 on each of 12 commits. Cancellation regression passed. | Passed. Bottom-tab taps also retained the document. |

For the swipe trace, the fixture seeded a 60-verse chapter and withheld idle warming. From Bible it swiped to Friends, Profile, Friends and Bible three times. An animation-frame sampler checked the incoming panel while it intersected the viewport. The cold destination stayed offscreen during the initial drag. The slowest repeatable transition was the first swipe into Friends, with a maximum interval between animation callbacks of 167 ms in the final trace and 200 ms in a separate run. Warm return intervals peaked at 17 ms in the final trace. A cold first swipe can still hitch.

| Additional check | Final observation | Assessment |
| --- | --- | --- |
| Requests per transition | First Friends visit 11 requests (5 API), first Profile visit 6 (2 API), each subsequent return 2 (1 API) within the trace window | Change from Step 1 unverified. Baseline per-return counts were unavailable. |
| Used JS heap after garbage collection | 25.3, 25.6 and 25.6 MiB after successive four-swipe cycles | Stable over this short run. Step 1 heap comparison and long-session behavior unverified. |
| Input during adjacent preparation | Typed in Pray while releasing queued idle work. Bible changed from unprepared to module-ready and Pray retained all 16 characters in order. | Passed for input continuity. Keystroke latency on a phone is unverified. |
| Displayed and dropped frames on a phone | Browser animation callback intervals only | Unverified. No phone was attached, and Step 1 had no comparable frame-time series. |

The production build passed on retry after a transient font-resolution failure. Four targeted Chromium regressions passed in the final run, including cold navigation, cached restoration and Back. These results cover the browser return-swipe fix. Physical release signoff still requires a signed-in release build on a phone, including a cold Friends swipe and repeat visits with saved data.
