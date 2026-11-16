# Mission 6B — Bounded prayer delivery

Completed local implementation and verification on 17 November 2026.

The inbox, deletion feed and sent replies now use stable pages of ten descriptors. Audio payloads stream separately and decode in workers, with at most two downloads across normal and notification work. Deep notification targets have an independent task. Failed payloads remain pending; acknowledgements follow durable text/audio persistence. Existing clients and older-server responses remain supported.

The [implemented contract](../docs/pray-inbox-protocol-review.md) documents cursor semantics, ownership, cancellation, limits and deployment order. Per-payload persistence is intentional: batching ten decoded audio bundles would multiply peak memory. Worker parsing removes that CPU work from the UI thread; it does not eliminate storage or React work.

## Evidence

- Production build and changed-source lint passed (pray-mission-6b-build.log, pray-mission-6b-lint.log). Build used CIRCLE_NODE_TOTAL=3 to limit Next workers after an initial host-memory failure.
- Full frontend regression: **181/181**, including eight new transport/worker tests (pray-mission-6b-tests.log). An additional production-page v2 notification test passed separately after correcting its asynchronous test assertions (pray-mission-6b-page.log).
- Backend: **41/41**, including ten actual HTTP/MongoDB/S3-SDK integration tests (pray-mission-6b-backend-final.log). Production payload workers ran in Chromium and WebKit. The object endpoint is local, not Cloudflare R2.
- Two independent client stores exercised real controllers, lost-send-response idempotency, anonymous audio, failed acknowledgement/replay, reply and revocation.
- The 2,000-record descriptor scan used 200 pages; largest response was under 1 KB. First-page query examined eleven documents with an index and no collection scan. Raw timings/counts: [transport measurements](pray-mission-6b-transport.json). These local synthetic measurements exclude physical mobile storage and WAN latency.

Reproduce backend checks from backend:

    node --test tests/prayer-delivery.integration.test.js tests/prayer-idempotency.test.js tests/prayer-revocation.test.js tests/prayer-push.test.js tests/backup-account.test.js

Reproduce added client checks from frontend after a production build:

    node --test tests/prayer-inbox.test.cjs tests/prayer-payload.test.cjs
    node --test --test-name-pattern="versioned inbox" tests/prayer-notification-opening.browser.cjs

## Release and remaining external validation

1. Deploy backend support and ensure the new transit/deletion compound indexes are built before expecting indexed performance. Preserve legacy endpoints; do not drop indexes automatically.
2. Release the frontend. Old servers still work but cannot provide bounded descriptor responses. Neither backend nor frontend has been deployed here.
3. Previous native atomic-storage changes require a new APK/iOS binary; OTA alone cannot install those native changes. This mission itself adds JavaScript/server code.
4. Validate save/restart, microphone/playback, gestures and background backup on physical Android/iOS hardware and the deployed service. No Android device is attached, and this Windows host cannot compile/run Xcode.

The 64 MiB download cap exceeds the existing 50 MiB send request limit. An exceptional historical object above that cap remains pending with Retry; arbitrary-size legacy object migration is outside this implementation. No partial-audio acknowledgement is allowed.
