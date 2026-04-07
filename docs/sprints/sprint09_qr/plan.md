# Sprint 09 — QR Fallback for Location Validation

**Goal:** Add a practical QR-based fallback path for location validation, especially for interior or low-signal locations, by enabling QR per game, generating printable QR labels for game locations, and exposing an in-game `Scan QR` action in `findloc`.

**Scope:** Planning the first usable QR workflow across game settings, location admin, printable QR label generation, and in-game QR scanning for `findloc` only.

**Out of scope:** Selfie validation improvements, map-mode QR validation, per-location QR requirement rules, complex QR security hardening beyond the selected payload approach, and a full camera UX redesign across the whole app.

**Status:** Planned.

**Clarified decisions from this planning pass:**
- QR payload should use a **unique ID/token**, not a signed URL
- QR should be an **optional fallback** when enabled for the game
- printable labels should include **all game locations**
- in-game scan should **auto-submit** on successful recognition

**References:**
- [app/main/routes.py](../../../app/main/routes.py)
- [app/templates/game/game_form.html](../../../app/templates/game/game_form.html)
- [app/templates/admin/game_locations.html](../../../app/templates/admin/game_locations.html)
- [app/templates/findloc.html](../../../app/templates/findloc.html)
- [app/static/js/findloc.js](../../../app/static/js/findloc.js)
- [app/static/js/qr.js](../../../app/static/js/qr.js)
- [app/static/js/validate.js](../../../app/static/js/validate.js)
- [app/templates/base.html](../../../app/templates/base.html)
- [app/models.py](../../../app/models.py)

---

## Why This Sprint Exists

QR validation was originally intended as another fallback path for confirming that a player reached the right clue location.

This is especially valuable when:

- geolocation is unreliable indoors
- the player should not need to rely on GPS precision
- selfie validation is unavailable or not yet sufficient for the situation

The current codebase already contains pieces of QR functionality:

- a dormant `enable_qr_scanner` flag is already passed into the `findloc` template as `False` in [app/main/routes.py](../../../app/main/routes.py)
- `findloc` already contains a QR button/video container block in [app/templates/findloc.html](../../../app/templates/findloc.html)
- [app/static/js/qr.js](../../../app/static/js/qr.js) already contains camera + `jsQR` scanning logic
- [app/static/js/validate.js](../../../app/static/js/validate.js) already contains QR-oriented validation helpers
- [app/templates/base.html](../../../app/templates/base.html) already loads `jsQR`

So Sprint 09 should not invent QR support from scratch. It should leverage this partial QR codebase and turn it into a coherent game-admin + gameplay workflow.

---

## Requested Outcome

This sprint should plan the following product behavior:

1. the game edit page gets an `Enable QR` toggle
2. the game locations page gets a `Print QR Codes` action
3. printing generates a sheet of `3 x 10` QR labels sized for `2⅝" × 1"` address labels
4. each printed label includes the QR code plus a human-readable label underneath
5. when QR is enabled for a `findloc` game, the clue UI shows `Scan QR`
6. the `Scan QR` button appears on the same line as `Take Selfie`
7. scanning should prefer the device's rear camera
8. the app should wait for the camera to stabilize enough to detect a QR code
9. once the QR is recognized, the app should auto-submit validation for that clue/location

---

## Current Observations from the Existing Code

### Game settings already have a natural home

[app/templates/game/game_form.html](../../../app/templates/game/game_form.html) is already the place for operator game settings such as mode, discoverability, branding, and status. `Enable QR` belongs there rather than on a separate admin page.

### The QR scanner UI is partially present already

In [app/templates/findloc.html](../../../app/templates/findloc.html), there is already a conditional QR block:

- `btn-validate-qr`
- `qr-container`
- `qr-video`
- `qr-canvas`
- `qr-result`

But it is effectively disabled today because [app/main/routes.py](../../../app/main/routes.py) currently renders `findloc.html` with:

- `enable_qr_scanner=False`

### The QR scanner implementation already exists, but is incomplete for this use case

[app/static/js/qr.js](../../../app/static/js/qr.js) already:

- requests camera access
- prefers `facingMode: "environment"`
- reads frames from the video
- decodes using `jsQR`

However, it currently behaves like a generic scanner helper and not a game-aware location validator. It also has a parameter mismatch bug in `initQRScannerIfPresent()` because it passes element references to `startQRScanner()` even though that helper expects element ids.

### Validation logic also has early QR placeholders

[app/static/js/validate.js](../../../app/static/js/validate.js) contains:

- `validateByQR()`
- `handleQrScan()`

But the current logic is still placeholder-quality:

- it compares the scanned value directly with an expected location id
- it includes simulated prompt-based QR flow in older validation code

This needs to be replaced with a real QR payload and real client/server validation path.

### Printable QR generation does not appear to exist yet

There is no visible existing printable QR label flow in the current admin UI. That means Sprint 09 likely needs:

- QR token generation strategy
- a print view route/template
- QR image rendering strategy

---

## Product Decisions for Sprint 09

### 1. QR is game-level optional fallback

If a game has QR enabled:

- `findloc` shows `Scan QR`
- QR acts as an optional fallback path
- normal gameplay options remain available

This matches the clarified preference for **optional fallback**, not a mandatory or preferred-first rule.

### 2. QR payload should be a unique app token

Each QR code should encode a unique app-level identifier/token rather than a direct URL.

Recommended payload shape:

- opaque token string, or
- structured short payload like `geokr:qr:<token>`

Avoid embedding raw user-facing URLs as the primary plan.

Why this is preferable:

- cleaner app-controlled validation
- simpler future expansion
- avoids encouraging browser navigation from scanned camera payloads
- supports auto-submit inside gameplay more naturally

### 3. Printable output includes all locations for the game

The `Print QR Codes` action should generate one label per game location.

This keeps the first version simple and predictable.

### 4. Auto-submit after successful scan

When the player scans a valid code for the active clue/location:

- the app should auto-submit the success
- the user should receive clear feedback
- the scanner should stop cleanly

No extra confirmation tap is required in the first version.

---

## Recommended Data Strategy

### Recommendation: keep QR settings in existing game/location metadata where practical

To stay consistent with recent sprint decisions, prefer using existing JSON-backed metadata rather than jumping immediately to schema changes unless truly necessary.

Recommended first-pass storage:

- game-level flag in `Game.data`, e.g. `qr.enabled`
- location-level QR token in `Location.data` if such flexible metadata exists, or in another existing flexible field if already available

If `Location` does **not** currently have a practical metadata field, then Sprint 09 may need a small targeted model change for a `qr_token` column. That should be decided in implementation after a quick model audit.

The plan should prefer the smallest durable shape needed to:

- generate stable printable labels
- validate scanned tokens to locations
- regenerate missing tokens safely if needed

### Token requirements

Each location token should be:

- unique
- stable for printing unless explicitly regenerated
- not easily guessable

Recommended token style:

- URL-safe random token
- stored per location

---

## Proposed Operator UX

## Phase 0 — Audit Existing QR Codebase and Data Model

**Goal:** Determine how much of the existing QR implementation can be reused safely.

**Plan:**
- inspect how `findloc` is rendered in [app/main/routes.py](../../../app/main/routes.py)
- inspect current QR scanner code in [app/static/js/qr.js](../../../app/static/js/qr.js)
- inspect QR validation placeholders in [app/static/js/validate.js](../../../app/static/js/validate.js)
- inspect whether `Game` and `Location` have flexible metadata fields suitable for QR settings/tokens
- decide whether QR token storage can avoid a migration or needs a minimal schema addition

**Acceptance criteria:**
- the implementation path for QR config and QR token storage is known before code changes begin

---

## Phase 1 — Add `Enable QR` to Game Edit

**Goal:** Let operators turn QR support on or off per game.

**Plan:**
- add an `Enable QR` toggle to [app/templates/game/game_form.html](../../../app/templates/game/game_form.html)
- surface the current setting in the form state from [app/main/routes.py](../../../app/main/routes.py)
- persist the setting in `Game.data['qr']` or equivalent
- default to off for existing games unless already enabled

**Acceptance criteria:**
- operators can enable/disable QR on the game edit page
- the setting persists correctly
- existing games remain unchanged unless explicitly edited

---

## Phase 2 — Add QR Management Entry Point on Game Locations Page

**Goal:** Put QR printing where location management already lives.

**Plan:**
- add a `Print QR Codes` button to [app/templates/admin/game_locations.html](../../../app/templates/admin/game_locations.html)
- show it only when editing an existing game in bound game mode
- if QR is disabled for the game, decide whether to:
	- hide the button, or
	- disable it with explanatory text

**Recommendation:** disable with explanatory text if possible, so the operator understands why printing is unavailable.

**Acceptance criteria:**
- the location-management page exposes QR printing in the game-scoped workflow
- the operator does not need to hunt in a separate tool to print labels

---

## Phase 3 — Generate Printable 3x10 QR Label Sheet

**Goal:** Create a printable sheet suitable for Avery-style label stock.

**Target stock:** Avery `5160` / `5960` or compatible labels sized `2⅝" × 1"`, arranged `3` columns by `10` rows per sheet.

**Recommended output:**
- one print-oriented route, e.g. `GET /game_admin/<game_id>/qr_labels`
- `30` labels per page
- each label sized for `2⅝" × 1"`
- `3` columns x `10` rows
- QR code centered in each label
- human-readable location label underneath

**Plan:**
- gather all game locations
- ensure each location has a stable QR token
- generate a print template with CSS tuned for a `2⅝" × 1"` label-grid layout
- include page-break support for games with more than 30 locations
- keep the printable layout clean and monochrome-friendly

### Human-readable label content

Recommended first-pass label text:

- location name
- optionally short id if helpful for admin troubleshooting

Avoid overly long clue text on labels.

### QR rendering approach

Recommended implementation options:

1. server-side QR image generation
2. client-side QR rendering into the print page

**Recommendation:** prefer server-side or deterministic render-at-load output for print reliability.

**Acceptance criteria:**
- a game can generate printable QR labels for all its locations
- the layout fits a `2⅝" × 1"` `3 x 10` label grid cleanly
- multiple pages work for larger games

---

## Phase 4 — Wire QR Enablement into `findloc`

**Goal:** Make the gameplay UI show QR only when the current game has it enabled.

**Plan:**
- update [app/main/routes.py](../../../app/main/routes.py) so `findloc.html` receives `enable_qr_scanner=True` when the game's QR setting is enabled
- update [app/templates/findloc.html](../../../app/templates/findloc.html) so the button label reads `Scan QR`
- place the `Scan QR` button on the same line as `Take Selfie`
- keep the button hidden when QR is disabled for the game

**Acceptance criteria:**
- QR is visible only for QR-enabled `findloc` games
- the UI layout places `Scan QR` beside `Take Selfie`

---

## Phase 5 — Turn the Existing Scanner into a Game-Aware Validation Flow

**Goal:** Reuse the existing QR scanner code but connect it to actual gameplay validation.

**Plan:**
- fix [app/static/js/qr.js](../../../app/static/js/qr.js) so it initializes correctly
- continue preferring the rear camera via `facingMode: "environment"`
- show clear scanner state such as:
	- opening camera
	- scanning
	- code detected
	- valid / invalid QR
- after scan success:
	- decode token
	- compare or validate against the current expected clue/location
	- auto-submit the validation
	- stop the camera stream cleanly

### Stabilization requirement

The user requested that the back camera turn on and stabilize before detection.

This should be interpreted as:

- use the rear camera when available
- do not submit until a real QR decode occurs
- provide a brief visible scanning state rather than immediately flickering success/failure

It does **not** necessarily require an artificial delay if the scan succeeds quickly.

### Validation approach

Recommended first-pass behavior:

- scanned token resolves to a location
- if it matches the currently active expected location, auto-submit success
- if not, show `QR does not match this clue` and keep the clue unresolved

**Acceptance criteria:**
- QR scanning uses the rear camera when available
- a valid scan can mark the current clue automatically
- a mismatched or invalid code is handled clearly without crashing the flow

---

## Phase 6 — Add Server-Side QR Validation Endpoint or Reuse Existing Validation Flow

**Goal:** Decide the safest submission path for scanned QR validation.

**Recommended approach:** add or adapt a server endpoint that validates:

- current team/user context
- current clue/location context
- scanned QR token

This is safer than trusting client-side location id comparisons alone.

Possible route shape:

- `POST /api/location/<location_id>/validate_qr`
- or `POST /api/game/<game_id>/validate_qr`

Payload could include:

- `token`
- optional `location_id`

Server responsibilities:

- resolve token to location
- ensure it belongs to the active game
- ensure it matches the current intended clue/location
- mark the location found using the existing success path where possible

**Acceptance criteria:**
- QR validation is verified server-side
- the endpoint integrates with the existing progression logic cleanly

---

## Testing Strategy

This sprint affects both operator setup and live gameplay, so it needs careful multi-layer testing.

## Automated test plan

### 1. Game edit/config tests

Add tests to verify:

- `Enable QR` renders on the game edit page
- enabling QR persists to the expected game setting structure
- disabling QR hides or disables QR-dependent admin actions appropriately

### 2. QR label page tests

Add tests to verify:

- the game locations page shows `Print QR Codes` in the bound game workflow
- the print route is admin-only
- the print view includes all game locations
- the print view includes human-readable labels
- the print view targets `2⅝" × 1"` label dimensions compatible with Avery `5160` / `5960`
- pagination or multi-page behavior works for more than 30 locations

### 3. QR token generation tests

Verify:

- each location gets a unique token
- tokens remain stable across re-renders unless explicitly regenerated
- games do not share the same token accidentally

### 4. Gameplay rendering tests

Verify in `findloc`:

- `Scan QR` appears only when QR is enabled
- the button label is exactly `Scan QR`
- it appears alongside `Take Selfie`

### 5. Validation API tests

Add tests to verify:

- valid token for the current expected location succeeds
- valid token for another location in the same game fails when it should
- unknown token fails safely
- token from another game fails safely
- successful scan updates progression correctly

### 6. Scanner integration tests

Full camera tests may be difficult in the current suite, so prefer testing the non-camera logic separately:

- token parsing
- success/failure branching
- auto-submit behavior once a decoded value is obtained

Mocking decoded QR results is acceptable for the first pass.

---

## Manual Validation Checklist

Run the following manually with an admin and a player account:

### Admin setup

1. open `Game Mgmt`
2. edit an existing `findloc` game
3. enable `QR`
4. save changes
5. open `Manage Locations`
6. use `Print QR Codes`
7. confirm the print sheet shows a `3 x 10` grid of `2⅝" × 1"` labels with readable location labels underneath
8. print or print-preview to confirm spacing looks correct for Avery `5160` / `5960` style stock

### Gameplay

9. join the QR-enabled `findloc` game
10. open a clue card
11. confirm `Scan QR` appears on the same line as `Take Selfie`
12. tap `Scan QR`
13. confirm the rear camera opens when available
14. scan the correct location QR
15. confirm the validation auto-submits and the clue advances
16. scan a wrong-location QR and confirm the app shows a clear mismatch response
17. confirm QR is absent in a game where `Enable QR` is off

### Edge cases

18. test indoors where GPS is weak
19. test on a device with camera permission denied
20. test on a device/browser where rear camera selection is imperfect

---

## Risks and Mitigations

### Risk 1 — Existing QR code is only partially wired and may be misleading

**Mitigation:** explicitly audit and refactor the existing QR helper rather than assuming it is production-ready.

### Risk 2 — Token handling becomes too fragile or guessable

**Mitigation:** use unique opaque tokens and validate them server-side.

### Risk 3 — Print layout does not line up with real label stock

**Mitigation:** build a print-specific template, test in browser print preview, and tune CSS specifically for `2⅝" × 1"` `3 x 10` label sheets such as Avery `5160` / `5960`.

### Risk 4 — Camera behavior varies across devices

**Mitigation:** request rear camera where available, provide clear fallback messaging, and keep manual validation on real phones in scope.

### Risk 5 — QR success bypasses the intended clue order incorrectly

**Mitigation:** validate scanned token against the current expected location or current allowed state on the server before marking progress.

### Risk 6 — Admins print labels before tokens are stable

**Mitigation:** ensure tokens are persistent and regenerated only intentionally.

---

## Definition of Done

Sprint 09 is complete when:

1. the game edit page has a persistent `Enable QR` toggle
2. the game locations page exposes `Print QR Codes`
3. the printable QR label view generates a `2⅝" × 1"` `3 x 10` sheet with readable labels for all game locations
4. `findloc` shows `Scan QR` only for QR-enabled games
5. `Scan QR` appears on the same line as `Take Selfie`
6. scanning uses the rear camera when available and auto-submits valid scans
7. QR validation is checked server-side against the current game/location context
8. automated tests cover config, print generation, token handling, and validation logic
9. manual validation confirms the workflow works on real devices and in print preview

---

## Recommended Implementation Order

1. audit the existing QR codebase and decide token storage
2. add `Enable QR` to game edit and persist it
3. add token generation/resolution support
4. add the printable QR labels route/template
5. add `Print QR Codes` to the game locations page
6. wire `findloc` to show `Scan QR` when enabled
7. refactor the scanner for real auto-submit validation
8. add server-side QR validation endpoint logic
9. add automated tests
10. manually validate on mobile devices and print preview

---

## Summary

Sprint 09 should convert the app's existing partial QR support into a usable fallback workflow for `findloc`.

The plan is to:

- enable QR per game from the edit page
- print QR labels from the game locations page
- use all game locations for a 3x10 printable sheet
- scan with the rear camera
- auto-submit on valid scan
- validate using unique app-controlled tokens rather than public URLs

This gives the product a strong indoor-friendly fallback path while reusing the QR scaffolding that already exists in the codebase.
