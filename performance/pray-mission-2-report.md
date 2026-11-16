# Pray state and audio ownership — Mission 2

Date: 16 November 2026. Scope: state/resource ownership and component boundaries, before list virtualization.

## Implemented

- Split the large page into `PrayerComposer`, `PrayerSharePicker`, `PrayerSettings`, and `PrayerCards`. The page retains collection loading, synchronization, and list coordination.
- Added a transient `PrayerSessionProvider` above route views, scoped to the authenticated owner. Composer text, sections, unsaved recording Blobs/URLs, recipient/anonymity, individual replies, inner tab/filter and expanded IDs belong to that session.
- Added field-level subscriptions. Composer updates do not update page list state; typing a reply notifies its own card rather than replacing the shared list-render callback. Recorder ticks notify the composer rather than the entire page.
- Added session-owned scroll offset capture per list/filter. Virtualizer anchor restoration remains Mission 3; this mission does not change current pager scrolling behavior.
- Moved microphone ownership to a persistent host. Route unmount does not cancel recording. Account/session teardown cancels the mic and releases draft resources. A delayed permission response cannot resurrect an obsolete session, and repeated starts cannot open concurrent microphones.
- Added shared playback ownership. A playing clip outlives a row and can reconnect to the same player. Unattached paused/finished resources are released. Starting another clip pauses the previous one; deleted recordings and session teardown release their resources.
- Playback uses an independently owned media element. Browser testing demonstrated that retaining WaveSurfer alone still allowed removal of its DOM audio element to pause playback; separating the media element fixed that failure.
- Isolated privacy-slider React state from the page, retaining the same CSS and UI. Preference writes remain debounced and flush on settings-component teardown, preserving the last adjustment during navigation.
- Replaced repeated per-card friend scans with maps derived when the friends collection changes.
- Updated outdated backup tests to use the current custom frequency menu and Escape dismissal, keeping the schedule, Wi-Fi, progress, modal focus, overflow and layout checks.

## Preserved boundaries

The web/localForage and native filesystem schemas, outbox request IDs, server APIs, backup formats and deletion rules are unchanged. No persistent composer draft storage was introduced. Device-wide saved history is not converted into per-account databases; only transient UI/audio state is scoped and cleared on account changes.

The retained list and permanent Prayer-page retention are still present. Batches of ten, virtualized rows and releasing hidden page UI are subsequent missions. Do not claim that this mission alone fixes the measured large-list DOM growth.

## Verification

- Production export builds successfully after these changes.
- Targeted source lint has no errors. The extracted avatar retains the existing Next.js warning about an unoptimized `<img>`; its offline-avatar behavior was preserved.
- Eight focused unit tests cover field subscription isolation, discard semantics, owner teardown, StrictMode effect replay, playing-resource reattachment, single-player behavior, delayed-resource cleanup and recording removal.
- Three new production-browser tests navigate through Profile to Plans, ensuring the entire Pray page actually unmounts. They cover draft/reply/filter/privacy persistence, microphone and pending recording lifetime, and reconnection to the same playing media instance.
- Existing prayer browser/unit checks and navigation checks are run against the production export; final totals and any remaining failures are recorded below.

Artifacts: `mission-2-build.log`, `mission-2-lint.log`, `mission-2-session-unit.log`, `mission-2-session-browser.log`, `mission-2-final-tests.log`.

Final result: **120/120 combined checks passed**, with test files run sequentially against the final production build. This includes the previously timing-sensitive trusted swipe. Earlier overlapping runs reproduced its timeout; the final passing run does not establish that timing sensitivity has been eliminated by this mission. After strengthening the pending-recording navigation/save case, the three session browser checks were rerun and all passed. No application source changed after the final build.

```powershell
node --test --test-concurrency=1 tests/prayer-session.test.cjs tests/prayer-cache.test.cjs tests/prayer-activity.test.cjs tests/prayer-sync.test.cjs tests/prayer-backup.test.cjs tests/prayer-notification-navigation.test.cjs tests/prayer-notification-opening.browser.cjs tests/prayer-session.browser.cjs tests/primary-tab-swipe.browser.cjs
```

## Limits and next mission

No physical mobile device was available. Browser microphone tests use a generated MediaStream; they verify lifecycle and actual browser MediaRecorder behavior, not a phone microphone/OS background policy.

DOM mutation counts are not React commit counts. Field-notification isolation is directly unit-tested, and browser interaction regressions are covered. A production React profiling build was not introduced.

The Mission 1 benchmark counted DOM `<audio>` elements. Session-owned media now lives outside card DOM, so that metric must be updated to count owned media/player lifetimes before a later before/after comparison. A reduction in DOM audio elements alone must not be presented as reduced resource use.

Next: Mission 3, batches of ten with measured variable-height virtualization, preserving focus, active playback, notification targets and scroll anchors. User continuation is required before starting it.
