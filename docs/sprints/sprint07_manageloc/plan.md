# Sprint 07 — Move Location Management Under Game Edit

**Goal:** Unify location management with the existing game-management flow so operators manage a game's locations from that game's edit experience instead of starting from a separate admin page with a global game selector.

**Scope:** Planning the move of the current `Manage Locations` experience into the game edit workflow, including route/template/navigation changes, compatibility considerations, and a deliberate test plan strong enough to protect this operator-critical surface.

**Out of scope:** Rewriting the full location editor interaction model, replacing the current location CRUD API, redesigning route management, or merging all admin tools into a single monolithic page.

**Status:** Planned.

**References:**
- [app/admin/routes.py](../../../app/admin/routes.py)
- [app/templates/admin/game_locations.html](../../../app/templates/admin/game_locations.html)
- [app/static/js/game_locations.js](../../../app/static/js/game_locations.js)
- [app/templates/game/game_form.html](../../../app/templates/game/game_form.html)
- [app/main/routes.py](../../../app/main/routes.py)
- [app/templates/base.html](../../../app/templates/base.html)
- [tests/test_game_admin.py](../../../tests/test_game_admin.py)
- [tests/test_map_mode.py](../../../tests/test_map_mode.py)

---

## Why This Sprint Exists

Today, location management lives on its own admin page:

- route: `GET /game_locations`
- template: [app/templates/admin/game_locations.html](../../../app/templates/admin/game_locations.html)
- JavaScript controller: [app/static/js/game_locations.js](../../../app/static/js/game_locations.js)

That page requires the operator to:

1. open a separate admin tool
2. pick a game from a dropdown
3. then begin editing locations for that game

This creates a split workflow:

- core game settings live in the Sprint 06 create/edit flow
- location editing lives elsewhere with its own game-selection context

For a game operator, that separation feels inconsistent because locations are one of the most important parts of a game's configuration. The natural place to manage them is from the game currently being edited.

Because location management is operationally important, this move should be made carefully, with backward-safe routing and stronger-than-usual regression coverage.

---

## Requested Outcome

Sprint 07 should produce a plan and implementation path for this operator-visible change:

1. location management is launched from the game edit screen
2. the operator does **not** need to pick the game again from a separate dropdown when already editing that game
3. the move preserves current location CRUD behavior
4. the transition is tested thoroughly before the old standalone entry point is removed or demoted

The final UX can still reuse the existing location-editing UI patterns; the important change is that the page becomes clearly scoped to one game and is reachable from that game's admin flow.

---

## Current Observations

### Existing standalone page

The current page in [app/templates/admin/game_locations.html](../../../app/templates/admin/game_locations.html):

- shows a heading `Manage Locations`
- renders a game dropdown `#gameSelect`
- fetches locations dynamically after selection
- supports filtering, add, edit, delete, and image upload

### Existing JS assumptions

[app/static/js/game_locations.js](../../../app/static/js/game_locations.js) currently assumes:

- a global game selector exists in the DOM
- the user chooses the active game client-side
- location fetches are driven by `/api/locations?game_id=<id>`
- creation posts `game_id` from the selected dropdown value

### Existing route layout

[app/admin/routes.py](../../../app/admin/routes.py) currently exposes:

- `GET /game_locations` via `manage_game_locations()`
- `GET /import_locations/<game_id>` for game-scoped import

### Existing admin navigation

[app/templates/base.html](../../../app/templates/base.html) currently exposes `Game Locations` as a separate admin-tools link.

### Existing game-edit flow

[app/templates/game/game_form.html](../../../app/templates/game/game_form.html) already serves as the unified create/edit surface for game settings. It is the best anchoring point for game-scoped tools because the operator is already working on a specific game there.

---

## Product Decision for Sprint 07

### Recommendation: make location management game-scoped first, remove duplicated game-picking second

The right end state is:

- edit a game
- open `Manage Locations` for that exact game
- work in a location screen already bound to that game

This avoids duplicated context and matches how operators think about the task.

### Recommended transition strategy

Do **not** hard-delete the old standalone route immediately.

Instead:

1. add a game-scoped route for location management
2. add a clear entry point from the game edit page
3. update the location-management template/JS to support preselected game context
4. keep the legacy route temporarily as a compatibility path or redirect
5. remove or repoint the old top-nav admin link only after tests and manual validation pass

This reduces rollout risk.

---

## Proposed UX Shape

### Primary navigation

From the game edit page, add a prominent secondary action such as:

- `Manage Locations`

Recommended placement:

- near the top header actions in [app/templates/game/game_form.html](../../../app/templates/game/game_form.html)
- only visible when editing an existing game, not when creating a brand-new unsaved game

### Game-scoped location page

Recommended route shape:

- `GET /game_admin/<game_id>/locations`

Recommended behavior:

- heading clearly names the current game
- no game dropdown when a game is already fixed by the route
- filtering, add/edit/delete, and upload still work
- optional back-link to the game's edit page

### Legacy entry point behavior

Recommended temporary handling for `GET /game_locations`:

- either redirect to a simple game picker that forwards to the new game-scoped route
- or preserve it for one sprint as a thin compatibility launcher

Preferred end state:

- the old page is no longer the primary operator workflow

---

## Architectural Direction

## Phase 0 — Audit Current Behavior and Dependencies

**Goal:** Identify exactly what the current standalone page depends on before moving it.

**Plan:**
- review `manage_game_locations()` in [app/admin/routes.py](../../../app/admin/routes.py)
- inventory all API dependencies used by [app/static/js/game_locations.js](../../../app/static/js/game_locations.js)
- verify whether any other pages deep-link directly to `/game_locations`
- inspect whether import/export flows should also become game-scoped from the same surface

**Acceptance criteria:**
- all current route, template, JS, and API dependencies are documented before code changes begin

---

## Phase 1 — Add a Game-Scoped Route

**Goal:** Make location management operate from explicit route context instead of dropdown-only context.

**Recommended route:**
- `GET /game_admin/<game_id>/locations`

**Plan:**
- create a new admin-protected route that loads one game by id
- render the locations page with the current game already bound in server context
- keep the old route available initially

**Acceptance criteria:**
- a direct URL can open location management for one game without requiring a selection step
- invalid or missing `game_id` returns a safe admin-facing failure path

---

## Phase 2 — Adapt the Template for Bound Game Context

**Goal:** Let the locations template run in game-scoped mode.

**Plan:**
- update [app/templates/admin/game_locations.html](../../../app/templates/admin/game_locations.html) to support two modes:
	- legacy picker mode
	- bound game mode
- in bound game mode:
	- hide or remove the game dropdown
	- show the current game's name in the heading
	- include a back-link to the edit page
- consider whether the page title should become `Manage Locations — <Game Name>`

**Acceptance criteria:**
- operators can tell which game's locations they are editing without inspecting hidden state
- the page no longer asks them to choose a game that is already known

---

## Phase 3 — Refactor the JS to Support Server-Provided Game Context

**Goal:** Remove the hard dependency on `#gameSelect` for the primary workflow.

**Plan:**
- refactor [app/static/js/game_locations.js](../../../app/static/js/game_locations.js) so it can initialize from:
	- a preselected `game_id` injected by the template, or
	- the legacy dropdown if still present
- preserve current behaviors for:
	- fetch locations
	- filter list
	- add location
	- save location
	- delete location
	- image upload
- make the code resilient if `gameSelect` is absent in bound mode

**Acceptance criteria:**
- one JS controller supports both transition states without DOM errors
- location creation still attaches the correct `game_id`

---

## Phase 4 — Add Entry Point from Game Edit

**Goal:** Make the game edit page the natural launch point.

**Plan:**
- add a `Manage Locations` action to [app/templates/game/game_form.html](../../../app/templates/game/game_form.html)
- show it only when `game` exists
- keep `New Game` flow simple: users must save first, then manage locations
- optionally add related links later for `Import Locations` or `Copy Locations`, but keep Sprint 07 focused on the main move

**Acceptance criteria:**
- editing an existing game exposes an obvious route to location management
- creating a new game does not show broken or premature location actions

---

## Phase 5 — Reconcile Global Admin Navigation

**Goal:** Avoid duplicate navigation patterns that fight each other.

**Plan:**
- review the standalone `Game Locations` item in [app/templates/base.html](../../../app/templates/base.html)
- choose one of these transition options:

### Option A — temporary compatibility link
- keep the nav item for one sprint
- repurpose it to a lightweight picker or legacy launcher

### Option B — remove once the new flow is validated
- remove the separate nav item after tests and manual admin validation are complete

**Recommendation:** start with Option A during implementation, then move to Option B once confidence is high.

**Acceptance criteria:**
- admin navigation communicates one primary workflow instead of two competing ones

---

## Testing Strategy

This feature should get both automated coverage and deliberate manual validation because it is a high-impact admin workflow.

## Automated test plan

### 1. Route and access tests

Add or update tests to verify:

- the new game-scoped locations route is admin-only
- a valid admin can open the page for an existing game
- an invalid game id returns `404`
- the edit page shows a `Manage Locations` link only for existing games

### 2. Template rendering tests

Verify that:

- the bound page shows the selected game's name
- the bound page does not require the old global selector
- the back-link to the edit screen is present
- the `New Game` page does not show `Manage Locations`

### 3. JS/bootstrap behavior tests

If current test coverage for this page is limited, add focused assertions around rendered bootstrap data rather than trying to exhaustively unit-test all browser behavior at once.

At minimum, cover:

- the template emits the game id needed by JS initialization
- the page can initialize without `#gameSelect` in bound mode

### 4. CRUD regression coverage

Add regression tests for the existing APIs or page-level flows used by location management:

- fetch locations for a specific game
- create location with game context
- update location
- delete location

These tests do not all need to be browser-level tests, but they should protect the move from accidental context breakage.

### 5. Navigation regression coverage

Verify:

- `Game Admin` -> `Edit Game` -> `Manage Locations` works
- any retained old entry point still lands on the correct game-scoped experience

---

## Manual Validation Checklist

Run the following manually with an admin account:

1. open `Game Mgmt`
2. edit an existing game
3. click `Manage Locations`
4. confirm the page clearly names the current game
5. add a new location and verify it belongs to that game
6. edit clue text, image, latitude, and longitude for an existing location
7. delete a location and confirm the UI refreshes correctly
8. use filter/search after loading the game
9. upload an image and assign it to a location
10. confirm there is an obvious way back to the edit screen
11. confirm the new-game page does not expose location management before save
12. if the old `Game Locations` nav link still exists, confirm it behaves intentionally and does not create confusion

For extra confidence, also test one legacy game with real existing locations to ensure the move does not only work for newly created data.

---

## Risks and Mitigations

### Risk 1 — JS breaks because `gameSelect` no longer exists

**Mitigation:** refactor the page to support both server-bound and dropdown-driven initialization during transition.

### Risk 2 — operators lose a quick way to jump between games

**Mitigation:** keep the legacy launcher temporarily or provide a small picker page if that workflow is still valuable.

### Risk 3 — location creation attaches to the wrong game

**Mitigation:** make `game_id` explicit in server-rendered page context and test create/update flows carefully.

### Risk 4 — navigation becomes more confusing before it becomes simpler

**Mitigation:** define one primary path from the game edit page and clearly label any temporary compatibility entry point.

### Risk 5 — import/export tools become orphaned

**Mitigation:** review adjacent location tools during implementation and decide whether they should remain in admin nav or gain game-scoped links later.

---

## Definition of Done

Sprint 07 is complete when:

1. a game-scoped location-management route exists
2. the game edit page provides the primary entry point to manage that game's locations
3. the location-management page works without requiring a redundant game dropdown in the main path
4. current location CRUD behavior still works
5. old navigation is either safely redirected or intentionally retained for transition
6. automated coverage protects routes, rendering, and core CRUD/context behavior
7. manual admin testing confirms the full flow is stable

---

## Recommended Implementation Order

1. audit current location-management dependencies
2. add the game-scoped route
3. adapt the template for bound game mode
4. refactor JS to support route-bound initialization
5. add `Manage Locations` from the game edit page
6. add tests for route access, rendering, and CRUD continuity
7. manually validate with at least one real game
8. only then decide whether to remove or demote the old standalone entry point

---

## Summary

This sprint should not treat location management as a separate global admin utility anymore. It should become part of the game-edit workflow, because locations are fundamental game configuration.

The move should be done carefully:

- game-scoped route first
- UI launch from edit page second
- compatibility path during transition
- solid automated and manual testing before removing the old pattern

That approach gets the product to a more unified operator experience without taking unnecessary risks on one of the most important admin workflows.
