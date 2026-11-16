# Pray performance — Mission 3

Date: 16 November 2026. Scope: UI batching and bounded rendering only.

## Implementation

- Each Journal/Circle filter starts with 10 available prayers. Near the end, another 10 become available automatically. A keyboard-accessible “Load 10 more” button provides manual continuation; the list announces its end visually.
- `PrayerList.jsx` replaces the retain-forever component. It measures variable-height rows, renders the viewport with a 240 px buffer on either side, and retains at most one additional focused row. Prefix offsets update after measurement batches; scroll lookup uses binary search and one scheduled animation frame.
- Stable row keys and session-owned reply drafts preserve editing. Active playback remains owned by the Mission 2 session; inactive player resources are released as rows unmount.
- Session state retains loaded limits, measured heights, and an item-ID/offset anchor per filter. Restoration waits for navigation to settle. Rotation invalidates stale widths and preserves the previous anchor rather than a temporary browser scroll clamp. Subpixel row boundaries use a one-pixel tolerance.
- Deep notifications resolve against the complete collection and jump directly to the required batch. New saves and explicitly revealed Circle updates also have a target; deferred incoming reorder behavior remains intact.
- Only the active list measures and mounts cards. Permanent outer Pray-page retention, settings polling, and broader navigation-work coordination remain Mission 4 work.
- Web localforage, native device files, delivery acknowledgements, and backup serialization were not changed. UI pagination does not reduce the persisted collection or turn full-index reads into paginated storage reads.

## Implementation decision

The installed `react-virtuoso` API was inspected first. Its `topItemCount` retains a prefix rather than one arbitrary distant editor. A small measured window was selected to preserve an actually focused textarea while bounding mounted rows, without introducing a second library. The layout calculations are isolated in `prayerListLayout.js` and tested separately.

## Verification

Final combined verification: **126/126 checks passed** in `pray-mission-3-final-tests.log` (approximately 145 seconds). Production build passed; targeted lint has zero errors. Build and lint logs are adjacent.

```powershell
node --test --test-concurrency=1 tests/prayer-list-layout.test.cjs tests/prayer-session.test.cjs tests/prayer-cache.test.cjs tests/prayer-activity.test.cjs tests/prayer-sync.test.cjs tests/prayer-backup.test.cjs tests/prayer-notification-navigation.test.cjs tests/prayer-notification-opening.browser.cjs tests/prayer-session.browser.cjs tests/primary-tab-swipe.browser.cjs
```

The browser tests cover:

- Complete traversal of 2,000 personal prayers, unique IDs, bounded mounted cards, reverse scrolling, and restoration across Journal/Circle and Friends/Pray navigation.
- One focused offscreen reply, release of its row on blur, and restoration of its draft across scrolling and filters.
- Long Arabic cards, keyboard navigation across batch boundaries, portrait-to-landscape remeasurement, and non-overlapping rows.
- Deep notifications while the backend is stalled; subsequent notification targets release the earlier offscreen card.
- Recording during scrolling; playback after its card unmounts; replies and saves; cached reads; unread state; deferred incoming activity; settings and backups.
- Existing session route-unmount and Chromium/WebKit navigation gesture regressions.

The complete 2,000-prayer traversal observed a maximum of **16 mounted cards** in the 390 × 844 browser viewport, including loading/measurement transitions. All 2,000 IDs were reached without duplicates. The 300-prayer Circle test initially mounted 5 cards at 6× CPU throttling. These are controlled browser fixtures, not a physical phone benchmark or the final identical-fixture Mission 7 performance comparison.

Targeted ESLint has no errors; the existing avatar `<img>` optimization warning remains. The production build passes. Arabic dark-mode browser output was visually inspected.

## Corrections found during verification

Obsolete tests expected all row wrappers or every previously opened card to remain mounted. Their replacement assertions preserve the behavioral checks and require bounded rendering. Rotation testing caught anchor drift caused by width invalidation and fractional scroll boundaries; both were corrected and the regression is included.

An intermediate combined run had the two obsolete assertions and one held-drag failure while a production rebuild overlapped the test process. A later run passed 125/126 checks, with the existing Friends-to-Profile trusted-touch test still failing in isolation. Its CDP move burst was replaced with frame-paced moves, and the warm neighbor is awaited (cold-neighbor coverage remains separate). The held-position and navigation assertions are unchanged, and the isolated check then passed. No production swipe logic was changed. The final combined run uses the completed production output and sequential test files; consult its result rather than treating intermediate runs as passing checks.

## Limits and next checkpoint

No physical Android or iOS device trace was collected. The whole prayer index remains cached, and native filesystem latency is not measured by these browser tests. Plain browser Find cannot search unmounted prayers; keyboard loading and row navigation remain available. Backend protocol/native storage modifications are outside this mission.

Pause for user review before Mission 4: release permanently retained hidden page UI and coordinate remaining work with mobile navigation.
