# Mission 5B — Native atomic storage review checkpoint

Status: implementation authorized by the user's continuation and completed on 17 November 2026. Android build/helper tests passed; iOS compilation and physical-device validation remain open. See the [implementation report](../performance/pray-mission-5b-report.md). The design below records the reviewed scope.

## Evidence and reason for the checkpoint

Mission 5A rejects corrupt/unreadable indexes and prevents a later mutation from replacing them with empty history. It cannot make Capacitor's existing `Filesystem.writeFile(index.json)` crash-safe. A fault-injection test simulates truncation followed by a write failure: the last published in-memory snapshot survives, but the on-disk index is damaged. A second native reader correctly rejects it. This is a known remaining risk, not a passing atomic-write guarantee.

Android `PrayerBackupArchive` and iOS `PrayerBackupArchive` read `index.json` directly. Neither shares the JavaScript promise lock. The installed Filesystem plugin delegates rename/write behavior to native libraries; a JavaScript temporary-file/rename sequence is not sufficient evidence of atomic replacement or recovery across both platforms.

The implementation plan requires: “Any required cross-runtime storage change must have a concrete compatibility design and its own review checkpoint.” Mission 5 remains in progress at this checkpoint; do not advance to Mission 6 or mark native crash safety verified.

## Proposed implementation

1. Add a small `PrayerStorage` native bridge, registered on Android and iOS. Keep the existing `Directory.Data/my_prays/index.json` path, JSON version 1 fields, audio paths, and ZIP manifest unchanged. Existing archives and histories need no schema migration.
2. Expose `readIndex()` returning raw JSON plus a content fingerprint, and `writeIndex({expectedFingerprint, data})`. Under a native lock, verify the current fingerprint before replacement; reject conflicts instead of overwriting another writer. A missing index is distinct from unreadable/corrupt index. Never accept a missing file as empty when a recoverable previous version exists.
3. Android: use one shared storage helper and Android `AtomicFile` recovery/read/write primitives, with `finishWrite` only after the full validated JSON is written and `failWrite` on failure. Backup index reads must use this helper too; ordinary direct file reads cannot reliably handle its recovery files.
4. iOS: use a shared serial storage queue, validated UTF-8 JSON, same-volume atomic replacement, and explicit recovery/error handling. Verify replacement semantics on supported iOS versions. Backup index reads must run through the same helper.
5. Route the JavaScript native adapter through this bridge when supported. On a conflict, reread and recompute a pure mutation with a bounded retry count; no audio deletion or acknowledgement may occur before the successful commit. Refactor mutators with accumulated side effects so retrying cannot duplicate them.
6. Preserve audio ordering: create bytes before metadata; remove bytes only after committed removal. A backup encountering concurrently removed audio must retain its previous cloud backup and report failure, never publish an incomplete replacement.

## Compatibility and rollout

- New binaries advertise the `PrayerStorage` capability. Older binaries retain their current Filesystem adapter; they do not receive an unsupported plugin call. The native atomic-write guarantee applies only to binaries with the new bridge.
- Do not deploy the bridge-dependent release solely as an OTA JavaScript update. Build and test the Android/iOS binaries first, then use the existing binary/OTA compatibility controls.
- Preserve the legacy error behavior conservatively: only recognized missing-file errors initialize an empty store. Older plugin builds returning unclassified errors may require an app update; do not use broad message matching to convert permission/I/O errors into missing data.
- Web uses Web Locks for cooperating updated tabs. Browsers without Web Locks and already-open older app versions are not covered by that cross-tab guarantee. A separate IndexedDB transaction adapter would be needed to remove that limitation.

## Acceptance checks

- Existing history and old ZIP fixtures remain readable; paths and manifest version are unchanged.
- Inject failure before write, during write, before replacement, and after replacement; restart readers and recover a complete old or new index, never empty/partial data.
- Concurrent native backup readers observe complete snapshots; failed backup leaves the last successful cloud archive intact.
- Two writers with the same fingerprint cannot both commit; the loser retries from fresh data or exposes a retryable error.
- Verify first-run absence, existing AtomicFile recovery files, corrupt JSON, permission denial, disk full, account changes and process termination.
- Run Android build/device checks and an iOS build/device check. Windows JavaScript mocks alone do not establish native atomicity.

Review this scope before implementation. After Mission 5B passes its available checks, document platform gaps explicitly and continue to Mission 6 only at the next user checkpoint.
