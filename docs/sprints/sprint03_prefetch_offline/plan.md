# Sprint 03 — Prefetch & Offline Play

**Goal:** Let players pre-download the assets needed for a game, play through poor connectivity, and sync progress back when connectivity returns.

**Scope:** Asset bundling, client-side storage, offline progress queueing, reconnect sync, and resume-token flow. No new game mode. No QR redesign. No major admin UI work beyond operator documentation.

**Criticality:** This sprint is high-risk. Offline play that only “mostly works” is worse than no offline mode at all. The implementation must be gated by rigorous validation before event use.

**Reference:** Review section "Sprint B: Asset Prefetch & Offline-First Play" in [docs/review-0330.md](../../review-0330.md).

**Status:** In progress.

**Completed so far:**
- Phase 0 — resume-token handoff restored
- Phase 1 — offline bundle API added
- Phase 2 — offline bundle persistence added
- Phase 3 — account-page prefetch added for bundle JSON, images, and tiles
- Phase 4 — durable offline found-event queueing added
- Phase 5 — reconnect/manual sync flow added
- Phase 6 — route/map UI now hydrates from offline bundles
- Phase 8 — automated coverage expanded and validation matrix documented

**Validation so far:** `pytest tests/ -v` → **51 passed, 0 failed**

---

## Background: What Already Exists

| Asset | Location | State |
|---|---|---|
| Service worker | [service-worker.js](../../../service-worker.js) | App shell, tile, and image caches already exist |
| Offline DB helpers | [app/static/js/offline-db.js](../../../app/static/js/offline-db.js) | IndexedDB support exists |
| Offline game helpers | [app/static/js/offline-game.js](../../../app/static/js/offline-game.js) | Partial/offline support scaffold exists |
| Offline sync helpers | [app/static/js/offline-sync-sw.js](../../../app/static/js/offline-sync-sw.js) | Sync plumbing exists but flow is incomplete |
| Tile prefetch demo | [app/templates/map/map_prefetch.html](../../../app/templates/map/map_prefetch.html) | Useful proof-of-concept |
| Tile list API | [app/api/routes.py](../../../app/api/routes.py) | `/api/tile-list` already returns tile URLs for a bbox |
| Resume token helpers | [app/main/auth.py](../../../app/main/auth.py) | `generate_resume_token()` and `verify_resume_token()` already exist |
| Success template | [app/templates/user/magic_success.html](../../../app/templates/user/magic_success.html) | Present but not currently used in the login flow |
| Found endpoint | [app/api/routes.py](../../../app/api/routes.py) | `/api/location/<id>/found` already performs idempotent found marking |

---

## Sprint Outcome Definition

Sprint 03 is complete when a player can:

1. log in and store a durable resume token locally,
2. prefetch the game bundle before play,
3. continue using the game UI when disconnected,
4. queue location-found events locally while offline,
5. sync those queued events once connectivity returns,
6. reload the app later and resume without needing a fresh email link.

**Operational expectation:**
- Preferred sync path: **Wi‑Fi only**
- Acceptable fallback: **manual cellular sync** when the operator/player explicitly allows it
- Unacceptable outcome: silent cellular sync that burns user data without clear consent

---

## Sync Policy — Wi‑Fi First, Cellular Only as Fallback

Because data usage and reliability both matter, sync behavior should be explicit.

### Recommended default behavior

1. **Prefetch should only be offered on Wi‑Fi** by default.
2. **Background sync should prefer Wi‑Fi** if the platform exposes enough network information.
3. If Wi‑Fi status cannot be determined reliably, the client should:
  - either wait for an explicit user action,
  - or show a clear confirmation before syncing over a metered connection.
4. **Cellular sync is a fallback**, not the default.

### UX policy

When unsynced events exist, show one of these states:

- **Waiting for Wi‑Fi to sync**
- **Ready to sync now over cellular**
- **Sync in progress**
- **Sync failed — retry on Wi‑Fi or force sync now**

### Recommended controls

- a player-facing toggle or button: `Sync now`
- a safety toggle: `Allow sync on cellular`
- a status badge showing pending item count

If browser APIs cannot reliably distinguish Wi‑Fi from cellular on all devices, design for **manual approval** rather than pretending the app knows.

---

## Engineering Principles

These principles should govern all Sprint 03 implementation decisions.

1. **Offline mode must fail safe.**
  - If the app is uncertain whether data is synced, it must show the item as pending, not complete.
  - If sync state cannot be verified, do not silently assume success.

2. **Never hide sync state.**
  - Players must be able to tell whether progress is:
    - synced,
    - pending sync,
    - failed sync,
    - waiting for Wi‑Fi.

3. **Never silently use cellular data.**
  - Prefetch and reconnect sync should default to Wi‑Fi.
  - Cellular use must be opt-in or explicitly confirmed when network type cannot be trusted.

4. **Never lose a found event once acknowledged locally.**
  - If the UI tells the player a find was accepted offline, it must be durably queued in IndexedDB.
  - Reloading the page or closing the browser must not discard acknowledged pending events.

5. **Manual sync must work before automatic sync is attempted.**
  - Automatic sync is an optimization.
  - Manual sync is the baseline reliability path.

6. **Prefer explicit recovery over clever background behavior.**
  - Clear retry states, recovery messages, and operator instructions are preferable to opaque heuristics.

7. **Real-device validation outranks desktop confidence.**
  - Browser devtools offline simulation is useful, but not sufficient for sign-off.

---

## Phase 0 — Re-activate Resume Token Flow

**Status:** ✅ Completed on March 30, 2026.

**Delivered:**
- `magic_login()` now generates a long-lived resume token after successful magic-link authentication.
- The login flow now renders `magic_success.html` instead of redirecting immediately.
- `magic_success.html` writes `resumeToken` to `localStorage` and then redirects into the normal app flow.
- Server-side login state is preserved while the handoff page renders.

**Files implemented:**
- [app/main/auth.py](../../../app/main/auth.py)
- [app/templates/user/magic_success.html](../../../app/templates/user/magic_success.html)

**Goal:** Restore the offline resume path so the client can keep a long-lived signed token in local storage after login.

**Problem:** `magic_success.html` exists, but Sprint 01 removed the dead/unreachable render path in `magic_login()`. The app currently redirects directly after login, so the resume token is never written client-side.

**Files:**
- [app/main/auth.py](../../../app/main/auth.py)
- [app/templates/user/magic_success.html](../../../app/templates/user/magic_success.html)

**Plan:**
- Change `magic_login()` to generate a resume token after successful login.
- Render `magic_success.html` instead of redirecting directly.
- Let that page store the resume token in `localStorage`, then redirect to the normal game entry page.
- Keep the existing flash/welcome behavior.

**Acceptance criteria:**
- Successful magic-link login writes a resume token to local storage.
- The user is still logged in server-side.
- The page redirects normally after token storage.

---

## Phase 1 — Define and Expose an Offline Bundle API

**Status:** ✅ Completed on March 30, 2026.

**Delivered endpoint:**
- `GET /api/game/<int:game_id>/offline_bundle`

**Actual payload now includes:**
- bundle version and generation timestamp
- game id, name, description, gametype, bounds, and branding
- active team id, name, start/end time, and progress counts
- assigned locations in route order
- clue text, image URL, `show_pin`, and found state
- related character data
- tile zoom list and computed tile URLs for the game bounds

**Access control:**
- requires login
- requires the requesting user to belong to a team in that game
- returns `403` for non-members

**Files implemented:**
- [app/api/routes.py](../../../app/api/routes.py)

**Tests added:**
- [tests/test_offline_bundle.py](../../../tests/test_offline_bundle.py)
- updated [tests/test_auth.py](../../../tests/test_auth.py) for the Phase 0 handoff page

**Goal:** Provide a single API payload containing the game data needed for offline play.

**Recommended endpoint:**
- `GET /api/game/<int:game_id>/offline_bundle`

**Files:**
- [app/api/routes.py](../../../app/api/routes.py)

**Bundle should include:**
- game metadata (`id`, `name`, bounds, branding if relevant)
- active team metadata
- assigned locations in route order
- clue text
- `show_pin`
- image URLs
- already-found state
- optional character/dialogue data if needed by current live UI
- tile prefetch metadata or direct tile URL list for the game bbox
- an offline bundle version/timestamp for invalidation

**Design rules:**
- Response should be safe to store as one JSON document in IndexedDB.
- Use ids and primitive values only.
- Keep it idempotent and read-only.
- Do not include anything secret beyond what the logged-in player already needs.

**Acceptance criteria:**
- Authenticated player can request the bundle for their active game.
- Payload is sufficient to render route or map play screens without extra API calls.
- Bundle schema is documented in code comments or plan notes.

---

## Phase 2 — Store Bundles in IndexedDB

**Status:** ✅ Completed on April 1, 2026.

**Delivered:**
- Preserved the existing `updates` IndexedDB store for queued outbound sync events.
- Added a separate `bundles` IndexedDB store for cached read-model data.
- Upgraded the browser DB schema from version 1 to version 2.
- Added bundle persistence helpers:
  - `saveOfflineBundle(bundle)`
  - `getOfflineBundle(gameId)`
  - `getOfflineBundleRecord(gameId)`
  - `deleteOfflineBundle(gameId)`
  - `listOfflineBundles()`
- Added client-side offline bundle helpers in `offline-game.js`:
  - `downloadOfflineBundle(gameId)`
  - `loadOfflineBundle(gameId)`
  - `removeOfflineBundle(gameId)`
  - `listOfflineBundles()`
- Exposed the helpers through `window.offlineGame` for future UI wiring and browser-side validation.

**Important design choice:**
- This phase did **not** replace the existing offline queueing system.
- It added a parallel bundle-persistence layer so the app now has:
  - `updates` store → queued sync actions
  - `bundles` store → cached offline game bundle snapshots

**Files implemented:**
- [app/static/js/offline-db.js](../../../app/static/js/offline-db.js)
- [app/static/js/offline-game.js](../../../app/static/js/offline-game.js)

**Validation:**
- No editor-detected JS errors in the changed files
- Full suite still green: `pytest tests/ -v` → **42 passed, 0 failed**

**Goal:** Persist the offline bundle on-device.

**Files:**
- [app/static/js/offline-db.js](../../../app/static/js/offline-db.js)
- [app/static/js/offline-game.js](../../../app/static/js/offline-game.js)

**Plan:**
- Add a stable IndexedDB store for offline bundles keyed by `game_id` and/or `team_id`.
- Store:
  - bundle payload,
  - download timestamp,
  - schema version,
  - prefetched image list,
  - prefetched tile metadata.
- Add helper methods such as:
  - `saveOfflineBundle(bundle)`
  - `getOfflineBundle(gameId)`
  - `deleteOfflineBundle(gameId)`
  - `listOfflineBundles()`

**Acceptance criteria:**
- A downloaded bundle survives page reloads.
- Bundle can be read back after going offline.
- Old bundles can be invalidated by version.

---

## Phase 3 — Prefetch Images and Tiles

**Status:** ✅ Completed on April 1, 2026.

**Delivered:**
- Added a player-facing offline download panel to the account page for the active team/game.
- Added explicit download and remove actions.
- Download flow now:
  - fetches `/api/game/<id>/offline_bundle`
  - saves the bundle in IndexedDB
  - caches the bundle JSON in the existing API cache
  - pre-caches clue/branding images in the image cache
  - pre-caches map tiles in the tile cache
- Added visible progress and status messaging during prefetch.
- Added a metered/cellular confirmation step before download continues.
- Added removal logic that clears the stored bundle and its cached assets for that game.

**Files implemented:**
- [app/templates/user/account.html](../../../app/templates/user/account.html)
- [app/static/js/account.js](../../../app/static/js/account.js)

**Goal:** Download the game’s heavy assets before play.

**Files:**
- [service-worker.js](../../../service-worker.js)
- [app/static/js/offline-game.js](../../../app/static/js/offline-game.js)
- [app/templates/map/map_prefetch.html](../../../app/templates/map/map_prefetch.html) *(reference only; can stay as a debug/demo page)*

**Plan:**
- Use the existing `/api/tile-list` endpoint to fetch tile URLs for the game bbox.
- Pre-cache relevant clue/location images.
- Add a prefetch action in the player flow, likely from account/game start UI.
- Report progress to the user: bundle JSON, images, tiles.
- Handle partial failures gracefully.
- By default, block or warn on prefetch when the device appears to be on cellular or a metered connection.

**Acceptance criteria:**
- A player can explicitly start prefetch.
- Images and tiles are available with the device offline.
- Prefetch progress/errors are visible.
- Data-usage expectations are made explicit before download.

**Validation:**
- No editor-detected JS errors in changed JS files
- Full suite still green: `pytest` → **42 passed, 0 failed**

---

## Phase 4 — Queue Offline Found Events

**Status:** ✅ Completed on April 1, 2026.

**Delivered:**
- Found-location submissions now include queue metadata needed for durable replay:
  - `client_event_id`
  - `client_timestamp`
  - `queue_key`
  - game/team/location ids
  - coordinates when available
- Added IndexedDB update upsert support so queued found events are updated in place instead of duplicated.
- Added queue-key lookup so repeated offline attempts for the same location de-duplicate locally.
- Queue records now preserve retry metadata and failure state.
- Player UI still advances optimistically while the event is pending.

**Files implemented:**
- [app/static/js/offline-db.js](../../../app/static/js/offline-db.js)
- [app/static/js/offline-game.js](../../../app/static/js/offline-game.js)
- [app/static/js/offline-sync-page.js](../../../app/static/js/offline-sync-page.js)
- [app/static/js/offline-sync-sw.js](../../../app/static/js/offline-sync-sw.js)

**Validation:**
- Added backend coverage in [tests/test_offline_sync.py](../../../tests/test_offline_sync.py)
- Full suite green: `pytest` → **45 passed, 0 failed**

**Goal:** Allow progress to continue while disconnected.

**Files:**
- [app/static/js/offline-game.js](../../../app/static/js/offline-game.js)
- [app/static/js/offline-db.js](../../../app/static/js/offline-db.js)
- [app/static/js/offline-sync-sw.js](../../../app/static/js/offline-sync-sw.js)

**Plan:**
- When `/api/location/<id>/found` cannot be reached, queue a local event instead of failing hard.
- Queue record should include at minimum:
  - `location_id`
  - `game_id`
  - `team_id`
  - `lat`
  - `lon`
  - client timestamp
  - unique client event id
- Update the local UI optimistically so the player can keep moving.
- Persist the queue in IndexedDB.

**Conflict/idempotency rules:**
- The server endpoint is already close to idempotent; preserve that behavior.
- Multiple queued attempts for the same location should not create duplicate success states.
- Local queue should de-duplicate identical pending events where possible.

**Acceptance criteria:**
- Player can mark a location as found with no network.
- Event is persisted locally.
- UI reflects pending/offline state clearly.

---

## Phase 5 — Sync on Reconnect

**Status:** ✅ Completed on April 1, 2026.

**Delivered:**
- Added reconnect/manual sync orchestration on the gameplay page.
- Added a visible sync status panel with:
  - pending count badge
  - `Sync now` action
  - `Allow cellular` opt-in toggle
- Automatic sync now runs on reconnect when the connection is acceptable under the current policy.
- Metered/cellular connections are held for manual approval unless the player opts in.
- Service worker sync now uses the real IndexedDB queue and accepts both generic and team-specific sync tags.
- Successful sync deletes queued records immediately, then refreshes authoritative game state.
- Permanent failures stay queued with failure state instead of being silently dropped.

**Files implemented:**
- [app/templates/findloc.html](../../../app/templates/findloc.html)
- [app/static/js/offline-game.js](../../../app/static/js/offline-game.js)
- [app/static/js/offline-sync-page.js](../../../app/static/js/offline-sync-page.js)
- [app/static/js/offline-sync-sw.js](../../../app/static/js/offline-sync-sw.js)
- [service-worker.js](../../../service-worker.js)
- [app/api/routes.py](../../../app/api/routes.py)

**Validation:**
- Added backend coverage in [tests/test_offline_sync.py](../../../tests/test_offline_sync.py)
- Full suite green: `pytest` → **45 passed, 0 failed**

**Goal:** Flush queued offline events back to the server when network returns.

**Files:**
- [app/static/js/offline-sync-sw.js](../../../app/static/js/offline-sync-sw.js)
- [app/api/routes.py](../../../app/api/routes.py) *(only if small server changes are needed)*

**Plan:**
- Detect reconnect via browser events and/or service worker background sync where available.
- Replay queued found-events in order.
- Mark queue items as synced only on confirmed success.
- Refresh local team progress after sync.
- Surface conflicts or permanent failures to the user.
- Prefer Wi‑Fi for automatic sync; require explicit user action for cellular fallback if Wi‑Fi cannot be confirmed.

**Recommended behavior:**
- If the server says the location was already found, treat that as success and clear the queue item.
- If the server rejects the event because the player was too far away, leave it unsynced and show a message.
- If auth has expired, use the stored resume token flow before retrying sync.
- If the network is available but appears metered, keep items queued and prompt the user before using data.

**Acceptance criteria:**
- Queue drains on reconnect.
- Duplicate or already-found events do not break sync.
- The visible progress matches the server after sync.
- Automatic sync does not silently consume cellular data unless the user has opted in.

---

## Phase 6 — Use Offline Data in the Live UI

**Status:** ✅ Completed on April 1, 2026.

**Delivered:**
- Added a shared offline play helper that reads the stored bundle and merges queued pending finds.
- Route mode now prefers the stored offline bundle when offline or when the page lacks live location data.
- Route clue cards now visibly distinguish:
  - synced finds
  - pending offline finds
- Map mode now hydrates from the stored bundle when offline.
- Map mode now shows pending sync state in marker popups and a visible sync status panel.
- Added a module-backed map page implementation so cached bundle data and queued updates can drive the map UI.
- Added the new route/map helper modules to the service-worker app shell cache list.

**Files implemented:**
- [app/static/js/offline-play.js](../../../app/static/js/offline-play.js)
- [app/static/js/app-init.js](../../../app/static/js/app-init.js)
- [app/static/js/findloc.js](../../../app/static/js/findloc.js)
- [app/static/js/map-play.js](../../../app/static/js/map-play.js)
- [app/templates/findloc.html](../../../app/templates/findloc.html)
- [app/templates/map/play.html](../../../app/templates/map/play.html)
- [service-worker.js](../../../service-worker.js)

**Validation:**
- No editor-detected JS errors in changed JS files
- Full suite green: `pytest` → **45 passed, 0 failed**

**Goal:** Make the existing play pages usable with cached data.

**Files:**
- [app/templates/findloc.html](../../../app/templates/findloc.html)
- [app/templates/map/play.html](../../../app/templates/map/play.html)
- relevant JS modules in [app/static/js](../../../app/static/js)

**Plan:**
- On load, attempt live data first when online.
- Fall back to the stored offline bundle when offline or when live fetch fails.
- Clearly show offline state in the UI.
- Distinguish between:
  - found and synced,
  - found locally but pending sync.

**Acceptance criteria:**
- Route mode still works with cached bundle while offline.
- Map mode still renders pins/clues from cached bundle while offline.
- Pending sync state is visible and not misleading.

---

## Phase 7 — Operator Documentation

**Status:** ✅ Completed on April 1, 2026.

**Delivered:**
- Updated [docs/review-0401.md](../../review-0401.md) into an operator/player offline rollout guide.
- Documented:
  - player login and prefetch steps
  - operator pre-event checklist
  - the distinction between offline bundles and queued updates
  - rollout limitations
  - troubleshooting guidance
  - recommended manual browser/device checks before event use

**Validation:**
- Documentation now reflects the actual implemented Phase 0–6 flow rather than future-only recommendations

**Goal:** Make this usable without reverse-engineering the code.

**Documentation to add/update:**
- player prefetch instructions
- admin/operator steps for enabling offline-ready games
- limitations (first login still needs connectivity; tile download size; browser storage limits)
- troubleshooting for resume-token and sync failures

**Candidate docs:**
- updated [docs/review-0401.md](../../review-0401.md)

**Acceptance criteria:**
- A non-developer operator can explain the offline flow.
- Known limitations are documented.

---

## Phase 8 — Tests

**Status:** ✅ Implemented on April 1, 2026.

**Delivered:**
- Added resume-token helper coverage in [tests/test_resume_token.py](../../../tests/test_resume_token.py).
- Expanded found-event sync coverage in [tests/test_offline_sync.py](../../../tests/test_offline_sync.py) for:
  - geo payload validation errors
  - non-member rejection
  - replay safety after team completion
- Added a dedicated validation/sign-off document in [docs/sprints/sprint03_prefetch_offline/validation-matrix.md](validation-matrix.md).

**Important note:**
- The automated portion of Phase 8 is now in the repo and passing.
- The manual browser/device/rehearsal checklist still needs to be executed by humans before production event sign-off.

**Validation:**
- Full suite green: `pytest` → **51 passed, 0 failed**

Create or expand tests for both backend and critical offline-adjacent behavior.

**This phase is mandatory, not optional.** Sprint 03 should not ship to an event until the test matrix below has been executed and signed off.

### Test strategy layers

1. **Backend automated tests**
  - validate bundle/auth/idempotency logic
  - run on every change
2. **Client integration/manual browser tests**
  - validate IndexedDB, service worker, cache behavior, reconnect handling
3. **Real-device field tests**
  - validate actual mobile browser behavior under spotty signal
4. **Event rehearsal / pilot run**
  - validate the full player journey with multiple devices and teams

### Non-negotiable go / no-go rule

If any of the following fail in rehearsal, offline mode stays disabled for production use:

- resume token does not restore access reliably
- queued found-events are lost after reload
- reconnect sync creates duplicate or inconsistent progress
- prefetched game cannot be played fully offline
- users cannot clearly tell whether progress is synced or pending
- cellular usage cannot be controlled or clearly disclosed

**Backend test targets:**
- offline bundle endpoint auth/access control
- bundle payload structure
- resume token generation/verification flow
- sync endpoint idempotency assumptions for repeated found events

### Additional backend cases

- bundle request for wrong team/game is rejected
- bundle version mismatch is handled cleanly
- repeated sync of same client event id is idempotent
- sync after team already completed is safe
- stale or invalid resume token is rejected cleanly
- malformed queued payloads fail safely with actionable errors

**Client-side/manual validation targets:**
- prefetch success
- reload with no network
- queueing a found event offline
- reconnect sync success
- expired auth + resume flow

### Rigorous client/offline test matrix

#### A. Login / resume
- first login on strong network
- close browser, reopen, resume works
- resume after server restart
- expired token path shows clear recovery message
- token missing/corrupted path does not strand the user in a broken state

#### B. Prefetch
- prefetch small game
- prefetch larger game with many images
- interrupted prefetch (close tab mid-download)
- partial asset failure (one image 404)
- retry prefetch after partial failure
- verify tiles/images are actually served from cache offline

#### C. Offline play
- full route play offline after prefetch
- full map play offline after prefetch
- reload device/browser during offline play
- mark one location offline
- mark multiple locations offline in sequence
- mark same location twice offline
- complete entire game offline

#### D. Sync behavior
- reconnect on Wi‑Fi and auto-sync succeeds
- reconnect on cellular and app waits for consent
- user forces sync on cellular and it succeeds
- sync interrupted halfway through
- retry after partial sync
- duplicate queued events do not duplicate server state
- already-found server state clears queue gracefully

#### E. Multi-device / conflict cases
- two players on same team offline on separate devices
- both mark same location found
- both sync later
- one device syncs before the other
- one device has stale bundle while another has current bundle

#### F. Device/browser coverage
- iPhone Safari
- Android Chrome
- at least one lower-end Android device with limited storage
- home-screen/PWA mode if that is a supported path

### Field rehearsal requirements

Before event rollout, run a rehearsal with:

- at least **2 teams**
- at least **2 devices per team**
- at least **1 iPhone + 1 Android**
- one forced offline segment of at least **15–20 minutes**
- one reconnect/sync segment on Wi‑Fi
- one manual cellular-sync fallback check

### Suggested sign-off checklist

- [ ] Offline bundle downloads successfully on target devices
- [ ] Cached assets survive reload
- [ ] Offline progress survives reload
- [ ] Pending sync state is visible and understandable
- [ ] Wi‑Fi reconnect sync works end-to-end
- [ ] Cellular fallback requires explicit user action
- [ ] No duplicate location completions after sync
- [ ] No player progress lost in rehearsal
- [ ] Operator can explain recovery steps

**Suggested files:**
- `tests/test_offline_bundle.py`
- `tests/test_resume_token.py`
- extend existing auth/api tests where sensible
- `docs/sprints/sprint03_prefetch_offline/validation-matrix.md`

### Recommended implementation sequence for safer delivery

To reduce risk, build and validate in this order:

1. resume-token flow
2. read-only offline bundle endpoint
3. bundle storage in IndexedDB
4. offline rendering from cached bundle
5. local queueing
6. manual sync button
7. Wi‑Fi-preferred automatic sync

Do **not** start with fully automatic background sync. Get manual sync correct first.

---

## Phase 9 — Commit and Tag `v1.2.0-offline-prefetch`

```bash
git add -A
git commit -m "feat: add offline bundle, resume token flow, and reconnect sync"
git tag v1.2.0-offline-prefetch
git push
git push origin v1.2.0-offline-prefetch
```

---

## Risks / Design Notes

- **Storage limits:** Browser storage quotas vary; tiles can get large quickly.
- **Auth expiry:** Offline play depends on a durable local resume path.
- **Conflict handling:** Two devices on one team may create overlapping offline events.
- **Service worker complexity:** Debugging cache invalidation and sync timing will be the hardest part.
- **In-memory tombstone cache:** Still not durable across restarts; if deleted/synced state matters to offline consistency, this may need redesign.
- **Network detection limits:** Browsers may not reliably expose Wi‑Fi vs cellular vs metered state. Design for safe fallback and explicit consent.
- **False confidence risk:** A desktop dev test passing is not meaningful enough; real-device field rehearsal is required.

---

## Checklist

- [x] Phase 0 — Re-activate resume token flow via `magic_success.html`
- [x] Phase 1 — Add `/api/game/<id>/offline_bundle`
- [x] Phase 2 — Persist offline bundle in IndexedDB
- [x] Phase 3 — Prefetch images and tiles
- [x] Phase 4 — Queue offline found-events locally
- [x] Phase 5 — Sync queued events on reconnect
- [x] Phase 6 — Use offline bundle in route/map play UI
- [x] Phase 7 — Document operator/player flow
- [x] Phase 8 — Add backend/offline validation tests
- [ ] Phase 9 — Commit and tag `v1.2.0-offline-prefetch`

---

## Out of Scope (Deferred)

- Full free-roam multiplayer conflict UI
- Major Flask blueprint/service refactor
- QR redesign
- Camera/selfie UX overhaul
- Native app packaging
