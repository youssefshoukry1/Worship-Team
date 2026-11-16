# Pray performance — Mission 4

Date: 17 November 2026. Scope: hidden UI and navigation-time view updates.

## Changes

- Removed permanent Pray-page retention from `PrimaryTabPager`. At most the active page and its immediate neighbors remain mounted; with swipes disabled only the active page mounts.
- Hidden Pray neighbors release the composer/settings UI and list subscription. Drafts, reply state, microphone and active playback remain owned by the account-scoped session. Returning consumes the current cached storage snapshot.
- Native backup status polling runs only while settings are open on the active page. Closing settings does not cancel native backup. Deletion-button expiry work pauses while the page is inactive and defers during navigation.
- Added a small UI state queue. Complete snapshots replace older queued snapshots; functional updates retain their order. Publication and reconciliation wait until navigation is idle, and queues are discarded on deactivation/unmount. Prayer, recording, profile and friend view state use it. Row-height measurements also wait during gestures.
- Kept storage writes, outbox processing, incoming persistence, and delivery acknowledgements outside the UI queue. In-progress delivery continues after the page leaves. The session retains successful repair completion so ordinary remounts do not repeat the repair scan.
- Added gesture cleanup deadlines: 30 seconds for a lost touch-end and 5 seconds around the navigation handshake, including service-worker readiness. Cancel, resize, errors, route changes and unmount release the hold.

## Verification

Production build and targeted ESLint (including an explicit undefined-name check) pass. Final combined results in `pray-mission-4-final-tests.log`: **132/133 passed**. The remaining failure was the new privacy test asking Playwright to pause its clock at a timestamp already passed during tool latency, before exercising application behavior. The fixture now uses an explicit start and future pause time; **2/2 lifecycle tests passed** in `pray-mission-4-lifecycle-final.log`. All 133 distinct checks therefore passed across these runs; this is not a claim of a single 133/133 run.

New checks cover 100 coalesced snapshots, ordered functional updates, disposal before navigation release, three distant-tab round trips with a preserved draft and at most three mounted panels, and 50 updates during a held browser swipe. The visible prayer remains unchanged until cancellation, then shows the latest update.

Additional browser checks advance a fake clock past the lost-touch deadline and verify publication resumes. Another freezes time before the 150 ms privacy debounce can finish, leaves Pray, and verifies unmount flushes the final blur strength.

The native backup bridge fixture verifies that closed settings make no further status polls while the simulated backup continues; reopening reads completed status. Existing production-browser checks cover actual route teardown with recording/playback, privacy preference persistence, deep notifications, full 2,000-prayer traversal and restored scroll anchors, sharing/replies, cache behavior, and Chromium/WebKit gestures.

These are controlled browser and adapter fixtures, not physical-device traces. No native storage format, archive format, or backend protocol changed. The final identical-fixture frame-time comparison remains Mission 7.

The first combined regression run caught a deletion handler still referencing the replaced raw state setter. It was corrected to use the new view setter; both local deletion and failed/retried shared deletion passed their targeted rerun. Intermediate failures remain in `pray-mission-4-tests.log` for traceability.

Reproduce the combined suite after `npm.cmd run build`:

```powershell
node --test --test-concurrency=1 tests/prayer-navigation-queue.test.cjs tests/prayer-navigation.browser.cjs tests/prayer-list-layout.test.cjs tests/prayer-session.test.cjs tests/prayer-cache.test.cjs tests/prayer-activity.test.cjs tests/prayer-sync.test.cjs tests/prayer-backup.test.cjs tests/prayer-notification-navigation.test.cjs tests/prayer-notification-opening.browser.cjs tests/prayer-session.browser.cjs tests/primary-tab-swipe.browser.cjs
```

## Next checkpoint

Pause before Mission 5: safer and cheaper storage updates, starting with failed reads/writes and concurrency rather than changing the storage schema blindly.
