# Mission 5B — Native index commits

Date: 17 November 2026. Implementation complete; platform validation remains partial. No deployment performed. Mission 6 has not started.

## Changes

- Added the `PrayerStorage` bridge on Android and iOS. It retains `my_prays/index.json`, version 1, existing audio locations, and ZIP format.
- Reads return a SHA-256 fingerprint. Writes compare it against fresh disk content under the shared native lock/queue. A stale writer fails; JavaScript rereads and recomputes, with at most three attempts.
- Android uses AndroidX `AtomicFile`, explicit file sync, rollback after write exceptions, recovery-aware reads, and verification after replacement. Native backup index reads use the same helper and lock.
- iOS uses Foundation atomic replacement and a shared serial queue for bridge writes and backup index reads. The source and registration are included in the Xcode project.
- Failed transactions do not publish UI snapshots or remove audio. Retry-sensitive mutation flags and restore cleanup collections reset for each attempt. Revocations and newer outbox actions are rechecked after conflicts.
- Capability detection retains the existing adapter on older binaries. An error from an available bridge never falls back to a direct write. Web storage behavior is unchanged.

This mission addresses durability and writer coordination. It does not claim a new frame-rate improvement: native reads still parse/hash the full index for mutations, while ordinary warm UI reads remain cached. Final performance comparison belongs to Mission 7.

## Validation

- Production web build passed: `pray-mission-5b-build.log`.
- Changed JavaScript source ESLint passed: `pray-mission-5b-lint.log`.
- Android `assembleDebug` and native unit tests passed: `pray-mission-5b-native-tests.log`. This compiles/packages the native changes; it is not an installed-device test of freshly synchronized web assets.
- Android **14/14** Robolectric tests: nine storage tests plus five existing backup tests. Coverage includes existing history, first-run absence, failures before/during/after writing bytes, `.bak` recovery, discarded `.new` files, invalid storage, lost acknowledgement, competing writers, and a backup reader blocked until a complete commit. These run real helper/AtomicFile code with temporary files under Robolectric, not a physical device or actual process termination.
- Seven JavaScript bridge tests exercise first-run writes, two runtimes, bounded conflicts, no fallback on bridge failure, committed audio cleanup, revocation during staging, and a newer action arriving during acknowledgement.
- iOS project checks verify source inclusion and bridge registration only; they are not Swift compilation or execution.
- Combined prayer regression suite: **158/158 passed**, zero skipped, in 151 seconds; recorded in `pray-mission-5b-tests.log`. Includes bridge/project checks, storage, sharing/outbox, backup/restore, notification opening, recording/session, and browser swipe/navigation scenarios. Full traversal reached all 2,000 prayers with a maximum of 16 mounted cards.

## Remaining release gates

No Android device is connected (`adb devices` returned an empty list). Physical disk-full/permission tests, app termination during save, restart recovery, and background-backup/device concurrency remain unverified. Exception injection and recovery-file fixtures do not establish power-loss guarantees.

This Windows environment has no Xcode/iOS simulator. Build the iOS app on a Mac, then exercise first-run and existing stores, replacement failure, interrupted saves/relaunch, competing bridge operations, and background backup on a device. iOS native behavior remains unverified until then.

The Android lock coordinates the current single-process app; it is not an interprocess file lock. Old binaries continue using the legacy non-atomic adapter. Ship new native binaries to gain this bridge; do not describe a JavaScript-only OTA as providing native atomic storage. Keep the platform validation gates open in the plan.

## API references

- [AndroidX AtomicFile](https://developer.android.com/reference/androidx/core/util/AtomicFile): replacement/recovery primitives require caller-provided synchronization.
- [Foundation atomic writing](https://developer.apple.com/documentation/foundation/nsdata/writingoptions/atomic): auxiliary-file replacement; actual iOS fault/restart validation remains required.
