# Pray performance — Mission 5A

Date: 17 November 2026. Status: JavaScript/storage-adapter safety and batching checkpoint; Mission 5B native atomic persistence remains pending review.

## Implemented

- Read errors no longer become empty histories. Missing web records and recognized native missing-file codes are distinguished from permission errors, I/O failures, malformed JSON, invalid index shapes and unsupported versions. Failed reads reject mutations; the last published snapshot remains available.
- Added a storage error/retry message in Arabic, English and German. Retrying invalidates the failed cache and reloads existing history; it does not reset the store.
- Fresh read-modify-write operations use Web Locks across cooperating browser tabs when available. Runtime-local serialization remains in place. Successful persistence still precedes cache publication and delivery acknowledgement.
- Batched legacy import and encrypted text repair. Repair compares the original encrypted text inside the transaction, preserving newer text/reply updates. Legacy import retains existing local state and only copies the expected prayer fields.
- Incoming audio bytes are written before a single metadata commit per bundle. Incomplete recordings reject delivery rather than acknowledging missing audio. Actual share IDs are passed to revocation checks even when restored local prayer IDs differ.
- Combined prayer/recording metadata deletion into one transaction, with audio removal afterward. No-op patches, absent deletions, repeated imports/repairs and repeated action staging/settlement avoid writes.
- Removed redundant sorting of transaction result lists; callers use the published, reconciled snapshot. Unchanged card/recording references remain stable. Storage and ZIP schemas are unchanged.

## Performance evidence

`scripts/measure-pray-storage.cjs` compares revision `b058331` with the new batched repair using identical 2,000-prayer fixtures, repairing 100 entries. Results: `pray-mission-5-storage.json`.

| Adapter fixture | Previous reads / writes / publications | New reads / writes / publications | Previous time | New time |
| --- | --- | --- | --- | --- |
| Web structured-clone mock | 100 / 100 / 100 | 1 / 1 / 1 | 988 ms | 10.2 ms |
| Native JSON mock | 100 / 100 / 100 | 1 / 1 / 1 | 1,081 ms | 10.5 ms |

One hundred warm getters caused zero storage reads in both versions. These are controlled JavaScript/serialization measurements from one run, not native disk latency or a promised phone frame-rate improvement. Single-entry updates still read fresh storage; they do not mutate a potentially stale cache.

## Verification

**145/145 checks passed** in `pray-mission-5-final-tests.log` (approximately 144 seconds). Production build and targeted lint with undefined-name checks passed. The initial combined run was stopped after the stricter reader exposed native mocks returning `{}` for every filesystem read. Both native test mocks now implement a small file store and the installed plugin's explicit missing-file error; the complete rerun passed.

```powershell
node --test --test-concurrency=1 tests/prayer-storage-safety.test.cjs tests/prayer-navigation-queue.test.cjs tests/prayer-navigation.browser.cjs tests/prayer-list-layout.test.cjs tests/prayer-session.test.cjs tests/prayer-cache.test.cjs tests/prayer-activity.test.cjs tests/prayer-sync.test.cjs tests/prayer-backup.test.cjs tests/prayer-notification-navigation.test.cjs tests/prayer-notification-opening.browser.cjs tests/prayer-session.browser.cjs tests/primary-tab-swipe.browser.cjs
```

- Adapter fault-injection tests cover missing/corrupt indexes, permission/I/O errors, failed writes, immutable publication, retry, no-op updates, guarded repairs, audio metadata failure, incomplete delivery and two serialized web runtimes.
- Real browser integration verifies simultaneous saves from two tabs preserve both new prayers and existing history, and an IndexedDB read failure recovers through Retry.
- Existing storage, sync/outbox, acknowledgement, archive/restore, notifications, session audio, 2,000-row traversal and Chromium/WebKit gesture suites are rerun. See adjacent build/lint/test logs for results.

## Remaining risk and required review

A partial native filesystem write can still damage `index.json`. The injected partial-write test verifies that subsequent readers/mutations reject it rather than overwrite it with empty data; it does **not** establish recovery of the damaged file. There is no native atomicity claim.

Native backup readers currently access the file independently of JavaScript's lock. A safe fix requires Android/iOS bridge and backup-reader changes, capability-aware rollout and native validation. The concrete proposal is [Mission 5B](../docs/pray-native-storage-checkpoint.md). This is the implementation plan's explicit cross-runtime compatibility checkpoint, so Mission 5 is not marked fully complete and Mission 6 has not started.

Web Locks protect updated cooperating tabs only; older browser versions without Web Locks retain runtime-local serialization. Old already-open app code does not cooperate with the new lock. No cross-version or unsupported-browser concurrency guarantee is claimed.
