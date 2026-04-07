# Sprint 08 — Move Route Management Under Game Edit

**Goal:** Unify route editing with the game-management workflow so operators manage a game's routes from that game's edit experience instead of opening a separate admin page with a global game selector.

**Scope:** Planning the migration of the current `Game Routes` page into the game edit flow, including route/template/JS changes, a compatibility period for the old page, and a thorough automated + manual testing plan.

**Out of scope:** Rewriting the underlying route-data model, redesigning route semantics, changing player route assignment logic, or removing the legacy route-management page immediately.

**Status:** Planned.

**References:**
- [app/admin/routes.py](../../../app/admin/routes.py)
- [app/templates/admin/game_routes.html](../../../app/templates/admin/game_routes.html)
- [app/static/js/game_routes.js](../../../app/static/js/game_routes.js)
- [app/templates/game/game_form.html](../../../app/templates/game/game_form.html)
- [app/main/routes.py](../../../app/main/routes.py)
- [app/templates/base.html](../../../app/templates/base.html)
- [app/api/routes.py](../../../app/api/routes.py)
- [tests/test_game_admin.py](../../../tests/test_game_admin.py)
- [docs/sprints/sprint07_manageloc/plan.md](../sprint07_manageloc/plan.md)

---

## Why This Sprint Exists

The current route-management flow is split away from game editing:

- the admin dropdown exposes a separate `Game Routes` entry
- the page at `GET /admin/game_routes` starts with a game selector
- the operator must pick the target game again before editing routes

That creates the same fragmentation that Sprint 07 addressed for locations:

- game settings live in the game edit page
- route editing lives elsewhere
- the operator has to re-establish game context even when they already came from game administration

Routes are part of game configuration, not a separate global concern. They should be managed from the same operator surface as the rest of the game setup.

Because route editing can affect gameplay order and operator confidence, the migration should be careful, incremental, and well-tested.

---

## Requested Outcome

Sprint 08 should deliver a plan for this operator-visible change:

1. route editing is launched from the game edit page
2. the main route-editing flow is game-scoped and does not ask the operator to select the game again
3. the existing route CRUD behavior remains intact
4. the old route and old page can remain for a while, but should be hidden from primary navigation
5. the move is protected by solid automated tests and a manual validation checklist

---

## Current Observations

### Existing page and route

The current standalone route-management page is defined in [app/admin/routes.py](../../../app/admin/routes.py):

- route: `GET /admin/game_routes`
- handler: `manage_game_routes()`

The template in [app/templates/admin/game_routes.html](../../../app/templates/admin/game_routes.html):

- shows `Manage Routes`
- requires a `Select Game` dropdown
- renders empty route cards until a game is chosen

### Existing JavaScript assumptions

[app/static/js/game_routes.js](../../../app/static/js/game_routes.js) currently assumes:

- `#gameSelect` always exists
- game context is chosen client-side
- route loading starts only after dropdown change
- all mutation calls derive `game_id` from the selected dropdown value

### Existing API surface

[app/api/routes.py](../../../app/api/routes.py) already exposes game-scoped endpoints for route editing:

- `GET /api/game/<game_id>/routes`
- `POST /api/game/<game_id>/routes`
- `GET|PUT|DELETE /api/game/<game_id>/route/<route_idx>`
- `POST /api/game/<game_id>/routes/all`

This is important: the server-side API is already game-scoped. The current mismatch is mostly in the admin page and JS initialization model.

### Existing navigation

[app/templates/base.html](../../../app/templates/base.html) exposes `Game Routes` from the admin dropdown, making the standalone page the visible default path.

### Existing game-edit flow

[app/templates/game/game_form.html](../../../app/templates/game/game_form.html) is already the central game-edit surface. It is the natural place for a `Manage Routes` action, just as Sprint 07 made it the right place for `Manage Locations`.

---

## Product Decision for Sprint 08

### Recommendation: move the primary workflow first, keep the old page hidden during transition

The recommended end state is:

- open a game in the edit screen
- click `Manage Routes`
- edit routes already bound to that game

The old route/page should remain temporarily for safety, but it should no longer be the primary visible entry point.

### Requested transition behavior

Keep the old route and old page around for a while, but hide it from primary navigation.

That means:

1. add a new game-scoped entry from the game edit page
2. adapt the route editor to work in bound-game mode
3. remove or hide the `Game Routes` admin dropdown link
4. keep `/admin/game_routes` available as a compatibility path until manual confidence is high

This reduces risk while avoiding duplicate operator guidance.

---

## Proposed UX Shape

### Primary route-management entry point

From the game edit page, add a secondary action:

- `Manage Routes`

Recommended placement:

- near `Manage Locations` and `Back to Game Admin` in [app/templates/game/game_form.html](../../../app/templates/game/game_form.html)
- only visible when editing an existing game, not during unsaved new-game creation

### Game-scoped routes page

Recommended route shape:

- `GET /game_admin/<game_id>/routes`

Recommended behavior:

- the page heading clearly names the current game
- the game selector is hidden or removed when the route already determines the game
- route cards load immediately for that game
- there is an obvious back-link to the game edit page

### Legacy page behavior during transition

Keep `GET /admin/game_routes` available temporarily, but:

- remove it from the main admin dropdown
- treat it as a compatibility page
- optionally label it as legacy or transitional in the UI later, if needed

---

## Architectural Direction

## Phase 0 — Audit Current Route-Editing Dependencies

**Goal:** Confirm the full dependency chain before moving the UI entry point.

**Plan:**
- review `manage_game_routes()` in [app/admin/routes.py](../../../app/admin/routes.py)
- inventory the DOM assumptions in [app/static/js/game_routes.js](../../../app/static/js/game_routes.js)
- review the game-route APIs in [app/api/routes.py](../../../app/api/routes.py)
- confirm where route data is stored in `Game.data['routes']`
- check whether any tests currently cover route editing directly

**Acceptance criteria:**
- all current route-management dependencies are known before code changes begin

---

## Phase 1 — Add a Game-Scoped Route-Management Entry Point

**Goal:** Make the primary route-management page explicitly game-scoped.

**Recommended route:**
- `GET /game_admin/<game_id>/routes`

**Plan:**
- add a new admin-only route under the main game-admin flow
- load the selected game server-side
- render the existing route editor template in bound-game mode
- keep the old `/admin/game_routes` route intact during the transition

**Acceptance criteria:**
- operators can open route management directly for one game without picking it again
- invalid `game_id` returns a safe failure path such as `404`

---

## Phase 2 — Adapt the Template for Bound Game Context

**Goal:** Make the route-management page communicate its game scope clearly.

**Plan:**
- update [app/templates/admin/game_routes.html](../../../app/templates/admin/game_routes.html) to support two modes:
	- legacy picker mode
	- bound game mode
- in bound game mode:
	- show the game name in the page title and heading
	- hide the `Select Game` dropdown
	- add a back-link to the game edit page
	- load routes immediately for that game

**Acceptance criteria:**
- the page clearly shows which game's routes are being edited
- the operator is not asked to choose a game that is already known

---

## Phase 3 — Refactor the JS for Server-Bound Initialization

**Goal:** Make the route editor work with either template-provided game context or the legacy dropdown.

**Plan:**
- refactor [app/static/js/game_routes.js](../../../app/static/js/game_routes.js) so it can initialize from:
	- a server-provided `game_id` in the page, or
	- the existing `#gameSelect` dropdown in compatibility mode
- keep current behaviors intact:
	- fetch locations for the game
	- fetch current routes
	- add route
	- remove route
	- add/remove route locations
	- save all routes
- guard against DOM assumptions when `gameSelect` is absent

**Acceptance criteria:**
- the same JS works in both transition modes
- the route editor initializes cleanly in game-scoped mode without console errors

---

## Phase 4 — Add `Manage Routes` to the Game Edit Page

**Goal:** Make game editing the natural launch point.

**Plan:**
- add a `Manage Routes` action to [app/templates/game/game_form.html](../../../app/templates/game/game_form.html)
- show it only when `game` exists
- keep the new-game page simple: save first, then manage routes
- coordinate button placement with the existing `Manage Locations` action so the operator sees a coherent set of game-scoped tools

**Acceptance criteria:**
- the edit page exposes an obvious path to manage the current game's routes
- the new-game page does not show route-management actions prematurely

---

## Phase 5 — Hide the Legacy Entry Point but Keep It Available

**Goal:** Keep backward safety without presenting two competing workflows.

**Plan:**
- remove or hide the `Game Routes` link from [app/templates/base.html](../../../app/templates/base.html)
- leave `/admin/game_routes` functional during transition
- if desired, add a note or lightweight heading on the legacy page later to indicate that the preferred path is from game edit

**Acceptance criteria:**
- the old route still works if someone knows the URL
- the primary visible workflow is now the game edit page

---

## Testing Strategy

This migration affects an operator workflow that can change gameplay order, so it deserves careful testing.

## Automated test plan

### 1. Route and access coverage

Add or update tests to verify:

- `GET /game_admin/<game_id>/routes` is admin-only
- valid admins can open the new game-scoped routes page
- invalid game ids return `404`
- the game edit page shows `Manage Routes` only for existing games

### 2. Template rendering coverage

Verify:

- the game-scoped routes page shows the current game name
- the game-scoped page does not show the old `Select Game` dropdown
- the page includes the bound `game_id` needed by JS initialization
- the page links back to the edit screen
- the new-game page does not expose `Manage Routes`

### 3. Compatibility coverage for the legacy page

Verify:

- `/admin/game_routes` still renders during transition
- the legacy page still shows the game selector
- hiding the nav link does not break direct URL access

### 4. Route CRUD regression coverage

Add focused tests around the existing game-route APIs or page-level route flow:

- fetch existing routes for a game
- add a route
- update a route's location list
- delete a route
- save all routes in one operation

These can be API-level tests if browser-level coverage would be too heavy.

### 5. Integration path coverage

Verify the main operator path:

- `Game Admin` -> `Edit Game` -> `Manage Routes`

Also verify route isolation:

- editing routes for game A does not accidentally update routes for game B

---

## Manual Validation Checklist

Run the following manually with an admin account:

1. open `Game Mgmt`
2. edit an existing game
3. click `Manage Routes`
4. confirm the page clearly names the current game
5. confirm there is no redundant game selector in the main path
6. verify existing routes load automatically
7. add a route
8. add locations to a route
9. remove a location from a route
10. delete a route
11. click `Save All Routes` and verify success feedback
12. return to the game edit page using the back-link
13. confirm the new-game page does not show `Manage Routes`
14. confirm `/admin/game_routes` still works directly during the transition

For extra confidence, test with:

- a game with no routes yet
- a game with several existing routes
- a game with many locations to confirm the editor remains usable

---

## Risks and Mitigations

### Risk 1 — JS breaks because `gameSelect` is missing

**Mitigation:** support both bound-game and dropdown-driven initialization during transition.

### Risk 2 — route edits accidentally target the wrong game

**Mitigation:** inject the bound `game_id` server-side, use game-scoped API calls, and add regression tests for cross-game isolation.

### Risk 3 — operators lose access to a known legacy workflow too early

**Mitigation:** keep `/admin/game_routes` available while hiding it from navigation.

### Risk 4 — duplicate tool entry points cause confusion

**Mitigation:** make the game edit page the clearly preferred path and hide the standalone nav item.

### Risk 5 — route editor regressions silently affect gameplay order

**Mitigation:** add route CRUD tests plus manual validation using existing real game data.

---

## Definition of Done

Sprint 08 is complete when:

1. a new game-scoped routes-management route exists
2. the game edit page provides the primary visible entry point for route editing
3. the bound routes page works without a redundant game selector in the main flow
4. existing route CRUD behavior still works
5. the old `/admin/game_routes` page remains available but is hidden from primary navigation
6. automated tests protect route access, rendering, compatibility, and core CRUD behavior
7. manual admin testing confirms the new workflow is stable

---

## Recommended Implementation Order

1. audit current route-editor dependencies
2. add the new game-scoped route
3. adapt the template for bound-game mode
4. refactor JS initialization for bound or legacy modes
5. add `Manage Routes` to the game edit page
6. hide the old admin-nav entry but keep the old route/page working
7. add automated route, rendering, and CRUD tests
8. manually validate with real existing games
9. after confidence is high, decide when to delete the legacy route/page

---

## Summary

This sprint should treat route management the same way Sprint 07 treated location management: as a game-scoped configuration tool that belongs under the game edit experience.

The careful migration path is:

- add the new game-scoped entry point
- keep the old page working temporarily
- hide the old nav link
- add strong regression coverage
- manually validate before removing the legacy page entirely

That gives you a unified operator experience without forcing an abrupt cutoff from the older workflow.
