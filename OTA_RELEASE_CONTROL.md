# OTA release control

Open **Profile → App control center**, or `/ProgramerDashboard/`. The backend checks the account's current database `global_role` / `role`; only `PROGRAMER` accounts can view release data or change releases. A cached client role or an old JWT role cannot grant access.

## Normal release workflow

1. Build a new bundle with a higher numeric `x.y.z` version in `public/version.json`. Upload its ZIP to a new GitHub release. Do not reuse a version for different bundle contents.
2. Deploy the candidate's `version.json` to `https://wasla-w.vercel.app/version.json`. Its existing `version` and `url` fields identify the candidate. Updating this file does not authorize delivery to apps running the controlled updater.
3. Open the control center and refresh. New candidates start **On hold**.
4. Choose **PROGRAMER only**, set **Show update intro**, and save. Sign in to the installed app with your PROGRAMER account to test it.
5. The app silently downloads an authorized higher version during a check. On the next app opening, return to foreground, or later online check, it asks the server again and activates the downloaded bundle if permission still exists. Saving a release also requests a check on the device displaying the dashboard.
6. When testing succeeds, choose **All users** and save. Earlier public releases remain available to regular users while a newer release is being tested privately.

**Hold** revokes future delivery of that version. It does not roll back devices already running it. Earlier approved public releases remain available, and the updater never installs a version lower than the version currently running.

The intro setting is stored with each release and copied to the device before activation. The intro appears only when enabled and the running version is higher than the previously recorded version. First openings, disabled intros, missing policies, equal versions, and downgrades stay silent. Changing the toggle cannot replay an intro already marked as seen.

## First deployment and older apps

Deploy the backend before distributing the frontend bundle. Both are required; this is not a frontend-only feature. Existing database and authentication configuration are reused. There are no new credentials or environment variables. The frontend uses its existing API-base configuration.

Ship a **new version** containing this updater to existing installations once. Old installed bundles still fetch the legacy public manifest directly and cannot obey dashboard permissions. In particular, a device that has not migrated can still download whatever the old updater sees in `version.json`. Keep that legacy manifest on the transition release until the devices you need to control have migrated; do not treat a private candidate as private from old updater versions. A native app update is another way to deliver the transition.

The release database starts empty and authorizes no updates. Nothing is automatically promoted or seeded. Save a candidate explicitly to authorize it. No GitHub release, manifest publication, production deployment, or live database changes are performed by this code change.

## Device versions

Native Android/iOS apps report their active bundle version on authenticated update checks. Built-in apps report their local bundled version rather than the native binary version. The dashboard separates regular-user reports from PROGRAMER reports and shows installations seen in the last 30 days, plus up to 50 recent check-ins. Reports are deduplicated by a locally stored installation ID; clearing app storage creates a new installation ID. Devices running the old updater, signed-out devices, and devices that have not checked in are absent. Reports expire after 90 days.

## Implementation

- Backend: `POST /api/ota/check` reports the device and returns only eligible releases; `GET /api/ota/admin` reads candidate/releases/reports; `POST /api/ota/admin/releases` saves an audience and intro setting.
- Candidate discovery is read-only. New release creation verifies the candidate against the fixed manifest URL. Saved versions keep their bundle URL, and revision checks reject conflicting dashboard edits. Each release retains its last 50 changes.
- MongoDB collections: `OtaRelease` and `OtaDevice`, created through the existing Mongoose connection. No manual data migration is needed.
- The new updater uses `set()` only after a fresh authorization check. It does not use Capgo's automatic `next()` queue, so a held downloaded update cannot activate offline.
- OTA health confirmation runs before authentication/network checks. A release-service outage leaves the app usable without downloading or activating an update. Dashboard release history remains manageable when candidate discovery fails.

## Verification

From `backend`: `node --test tests/*.test.js`.

From `frontend`: `node --test tests/ota-update.test.cjs tests/wasla-splash-intro.test.cjs tests/push-notifications.test.cjs`, then `npm run build`.

After building: `node --test tests/ota-dashboard.browser.cjs`. If the bundled Playwright Chromium is not installed, use an installed Chrome by setting `PLAYWRIGHT_CHANNEL=chrome`. Browser tests stub external APIs and do not publish releases or contact production services.
