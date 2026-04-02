# GeoKR Offline Rollout Notes — April 1, 2026

**Author:** GitHub Copilot  
**Context:** Sprint 03 Phases 0–6 are now implemented. This note updates the earlier April 1 review into an operator/player guide for the current offline flow and the checks still required before event rollout.

---

## Current State

Sprint 03 now delivers the core offline path:

- resume-token handoff after magic-link login
- offline bundle API
- bundle storage in IndexedDB
- player-facing bundle download/remove UI on the account page
- durable queued found-events
- reconnect/manual sync with Wi‑Fi-first behavior
- route mode fallback to stored bundle
- map mode fallback to stored bundle
- visible pending-sync state in route and map play

This is now a **usable offline flow**, not just groundwork. It is still operationally sensitive and should be rolled out with explicit rehearsal and device checks.

---

## Player Flow

### 1. First login must happen online

The player must successfully log in while connected so the app can:

- authenticate the browser session
- store the resume token locally
- download the current offline bundle if desired

If a player has never logged in on that device, offline mode should not be treated as ready.

### 2. Download the offline bundle before play

From the account page, the player can use **Download offline bundle** for the active game/team.

That action now saves:

- bundle JSON
- clue/location images
- map tiles

The account page also allows **Remove offline bundle** if the player needs to clear stale data.

### 3. Play normally if connectivity drops

Once the bundle is saved:

- route mode can render from the stored bundle
- map mode can render from the stored bundle
- pending offline finds remain visible in the UI

The player should still be able to continue progressing, but pending items are not fully synced yet.

### 4. Sync later when signal returns

The play UI now shows:

- pending count
- sync status text
- `Sync now`
- `Allow cellular`

Default behavior is **Wi‑Fi first**. If the browser thinks the connection is metered/cellular, automatic sync should wait unless the player explicitly allows it.

---

## Operator Flow

### Before the event

1. Confirm the game is fully configured and assigned.
2. Confirm players can log in on-site or beforehand.
3. Instruct players to:
   - log in while online
   - switch to the correct team
   - open the account page
   - download the offline bundle before walking away from coverage
4. Verify at least one test device can:
   - load route mode offline
   - load map mode offline
   - queue a found event offline
   - sync that event later

### During the event

Operators should tell players:

- if the app shows **pending** progress, the find is saved locally but not yet synced
- if the app shows **waiting for Wi‑Fi**, they can either wait or use `Sync now` after enabling cellular
- if the app is fully offline, they should keep playing and sync later rather than retrying the same action repeatedly

### After the event or during troubleshooting

Operators can ask players to verify:

- they are on the expected team/game
- the offline bundle was downloaded on that device
- the pending count decreases after sync
- the same location is not repeatedly re-marked if already pending

---

## What a Non-Developer Should Understand

The offline model has two different kinds of local data:

1. **Offline bundle**
   - read-model cache
   - used to display the game while offline
   - includes locations, clues, images, and map tiles

2. **Queued updates**
   - write-model queue
   - used to remember local progress that has not synced yet
   - includes offline found-events waiting to be replayed

That distinction matters:

- deleting a bundle affects offline reading
- queued updates affect unsynced progress

---

## Practical Limitations

These should be communicated clearly before relying on offline mode in production.

### 1. First login still needs connectivity

Offline mode is not a substitute for initial authentication.

### 2. Tile download size can grow quickly

Map tiles are the heaviest part of the bundle. Large play areas or many zoom levels can consume significant browser storage.

### 3. Browser storage limits vary

Different mobile browsers may evict cached data or enforce lower storage quotas.

### 4. Cellular vs Wi‑Fi detection is imperfect

The app tries to behave safely, but browser network APIs are not perfectly reliable across devices.

### 5. Offline state is visible, not magical

If a location is marked **pending sync**, it is not yet authoritative on the server.

### 6. Multi-device conflicts are still a real-world risk

Two devices on one team can still create timing edge cases even with idempotent replay behavior.

---

## Troubleshooting Guide

### Problem: “I’m offline and can’t start the game”

Check:

- was the player ever logged in on this device?
- was the offline bundle downloaded before signal was lost?
- is the player on the correct team/game?

If not, reconnect and complete login + bundle download first.

### Problem: “The map/clues are blank offline”

Check:

- whether the offline bundle exists on the account page
- whether the player downloaded the bundle for the active team/game
- whether the browser may have cleared storage

### Problem: “I found a location but it says pending”

That usually means the event was stored locally but not yet synced.

Action:

- reconnect to Wi‑Fi if possible
- or use `Sync now`
- or enable `Allow cellular` if the player explicitly accepts data usage

### Problem: “The pending count never clears”

Check:

- whether the device is actually online
- whether the UI says **waiting for Wi‑Fi**
- whether the same event is being rejected repeatedly

If the player is online and authorized, use `Sync now` and watch whether the count drops.

### Problem: “The player got a new email link and things look inconsistent”

Have the player complete a fresh login, then revisit the game while online so the session and stored token path are both healthy before relying on offline mode again.

---

## Recommended Browser Checks Before Event Use

These are the minimum manual checks operators or testers should run on real devices:

1. **Login and bundle download**
   - log in on a fresh device
   - download the offline bundle successfully

2. **Offline route mode**
   - disable connectivity
   - confirm route clues still render

3. **Offline map mode**
   - disable connectivity
   - confirm map pins and popups still render

4. **Queue one offline find**
   - mark one location while offline
   - confirm the UI shows it as pending

5. **Reconnect sync**
   - restore connectivity
   - confirm pending count drops and state becomes synced

6. **Cellular policy check**
   - verify metered/cellular behavior does not silently sync without consent

7. **Reload persistence check**
   - reload the page after an offline find
   - confirm pending state survives reload

---

## Rollout Recommendation

This flow is now far enough along for guided field testing and controlled pilot use.

It is **not** yet something I would call “fully trusted for event use without rehearsal.”

Recommended next step:

- run the full manual/device test matrix from Sprint 03 Phase 8
- then decide whether offline mode is enabled broadly or only for selected operators/devices

---

*End of notes.*