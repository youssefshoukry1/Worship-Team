# Swipe navigation across Pray, Bible, Friends and Profile

Read this before changing primary-tab gestures, page previews or decorative blur inside a tab. Paths below are relative to the frontend repository.

## What made Android swipes smoother

The Galaxy A24 traces showed that Android WebView spent extra time presenting frames while two pages containing blurred cards and controls slid across the screen. Temporarily disabling decorative backdrop filters on the panels improved frame delivery. Restoring the original styling between experiments brought the slower frames back.

The fix lives in `src/app/components/PrimaryTabPager.jsx` and `src/app/globals.css`. With swiping enabled, the native Android pager sets `data-android-pager`. Inside that pager, hidden panels and panels marked `data-swipe-moving` disable backdrop filtering on `.app-card`, `.app-reading-surface` and elements with a `backdrop-blur` class. After a completed or cancelled swipe, the stationary active panel automatically regains its normal styling.

When adding a glass surface to a tab, check whether the existing rule covers it. Keep the rule scoped to decorative **backdrop** filters. The Pray editor uses a separate text filter for privacy, and its text must stay blurred throughout a swipe. The Android-specific rule leaves phone Chrome and iOS styling under their existing stylesheets.

## How a swipe works

1. **Recognize intent.** `src/app/utils/interiorSwipe.js` uses horizontal distance and recent release velocity. A short, quick flick can advance one tab. A small, slow drag eases back. The outer 24 CSS pixels on either side are reserved for system gestures. Vertical scrolling, horizontal carousels, text selection, sliders and open modal dialogs keep their own interactions.
2. **Prepare the neighbor.** The pager keeps at most the current tab and its immediate neighbors mounted. It warms adjacent pages during idle time after the current page commits. A ready neighbor follows the finger. If the destination is still cold, the current page stays visible during the drag. Accepting that swipe lets the destination load, with a bounded wait before the slide starts.
3. **Move two panels.** The pager measures and clips the source and destination to the visible area, retaining the document height and scroll offsets. Each drag frame updates their `translate3d` transforms. Keep layout reads, React state updates and list processing outside that per-frame path. Memoized page boundaries let preparation updates skip redundant page renders while activity, selection and data updates still reach subscribers.
4. **Settle and navigate.** An accepted swipe updates the bottom-tab highlight, finishes the slide and then navigates once. A cancellation returns to the current page and preserves its history and draft. Reduced-motion preference skips the settling animation. Cleanup releases deferred work and removes temporary panel styles. Tab taps and Back can interrupt an in-progress swipe.

### Note text during a swipe

Friends and Profile share `TestimonyCard.jsx`. A neighboring tab can already be on screen while the finger is down, before the route changes. Each mounted card therefore prepares its compact text size during browser layout. Two hidden samples wrap the note at 10 and 9 px in the same width as its visible title. A `ResizeObserver` uses their heights and the button's content height to select the largest size that fits, falling back to 8 px with an ellipsis for long notes. Apply that result in the observer callback before paint. Waiting for tab selection or scheduling another animation frame makes long notes visibly shrink.

## Measured result

On 19 November 2026, Android FrameTimeline recorded the same 240 ms gestures in all six directions on one Galaxy A24. The table shows the share of measured display-frame intervals longer than 25 ms during dragging and early settling.

| Build on the phone | Swipes | Intervals over 25 ms |
| --- | ---: | ---: |
| Installed Android app 2.0.3 | 24 | 58 / 304 (19.1%) |
| Phone Chrome | 12 | 22 / 166 (13.3%) |
| Updated Android build | 24 | 7 / 373 (1.9%) |

Every swipe reached its target. In the later window as the destination became active, the app's 95th-percentile interval improved from 67.1 ms to 56.1 ms. The longest measured interval was still about 101 ms. The full measurement method and separate drag, settle and handoff results are in `docs/android-swipe-latency-plan.md`.

## Verify a future change

Run from `frontend` so the browser tests exercise the current production export. The recorded fix passed all 47 tests in these suites.

```sh
npm run build
node --test tests/primary-tab-swipe.browser.cjs tests/swipe-velocity.test.cjs tests/swipe-work.test.cjs
```

For a rendering change, repeat the same-phone comparison in the installed app and Chrome. Swipe from Pray through Profile and back, and measure dragging, settling and destination activation separately. Also try a short flick, a slow cancellation and a return to a scrolled tab. Check the tab highlight, scroll position, prayer draft and privacy blur after each interruption. These checks catch regressions that a fast desktop browser can hide.
