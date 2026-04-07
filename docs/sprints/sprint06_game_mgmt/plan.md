# Sprint 06 — Game Management Create/Edit Flow

**Goal:** Turn the existing game management page into a usable operator surface by adding practical game status display, a `New Game` entry point, an `Edit game` action, and a dedicated game create/edit page for the core game settings and branding controls.

**Scope:** Admin/operator game management only: list-page improvements, create/edit routing, persistence for game status, branding upload + color selection, and the minimum validation needed to safely create and update games.

**Out of scope:** A full operator CMS, location/character editing on the same form, team assignment redesign, bulk import redesign, or deep workflow automation around starting/completing games.

**Status:** Implemented in code; automated validation complete; manual admin validation still recommended.

**References:**
- [docs/backlog.md](../../backlog.md)
- [app/main/routes.py](../../../app/main/routes.py)
- [app/templates/game/game_admin.html](../../../app/templates/game/game_admin.html)
- [app/static/js/game_admin.js](../../../app/static/js/game_admin.js)
- [app/models.py](../../../app/models.py)
- [app/admin/routes.py](../../../app/admin/routes.py)

---

## Why This Sprint Exists

The current `game_admin` page is only a thin action launcher:

- it shows `Game Name`, `Game ID`, and a placeholder `Status` value of `tbd`
- it exposes a dropdown of operational actions, but no way to edit core game metadata
- there is no top-level `New Game` flow for operators
- branding and experience-type configuration already matter elsewhere in the product, but there is no focused admin UI for them yet

This creates friction for organizers because the game model already supports several configuration concepts, but the operator UI does not expose them in a consistent or maintainable way.

Sprint 06 is meant to close that gap with a small but solid game-management foundation.

---

## Requested Outcome

The sprint should deliver the following operator-visible behavior:

1. the game admin list shows a real `Status` value instead of `tbd`
2. valid status values are `ready`, `ongoing`, `complete`, or empty
3. the actions dropdown includes `Edit game`
4. the top of the page includes a `New Game` button
5. both `New Game` and `Edit game` open the same dedicated create/edit page
6. the create/edit page includes:
	 - discoverable toggle: `no` / `public`
	 - mode toggle: `open` / `competitive`
	 - status dropdown: empty / `ready` / `ongoing` / `complete`
	 - branding image file picker/upload
	 - background color picker
	 - optional hex text field for the same color value
	 - game type selector: `findloc`, `map_hunt`

The page will also need at least the existing core identity field `name`, even though it was not separately called out, because a new game cannot be created meaningfully without it.

---

## Current Observations from the Existing Code

Based on the current implementation:

- [app/templates/game/game_admin.html](../../../app/templates/game/game_admin.html) renders a compact table with placeholder status text and only action-menu operations
- [app/main/routes.py](../../../app/main/routes.py) exposes `/game_admin` but no dedicated game create/edit page yet
- [app/static/js/game_admin.js](../../../app/static/js/game_admin.js) handles dropdown actions through a simple action-to-endpoint map
- [app/models.py](../../../app/models.py) already contains:
	- `mode`
	- `discoverable`
	- `gametype_id`
	- flexible `data` JSON used elsewhere for branding
- there is **not currently an explicit `Game.status` field** in the model
- [app/admin/routes.py](../../../app/admin/routes.py) already has an image upload endpoint that may be reusable for branding image upload rather than inventing a second upload pattern

This means most of the requested create/edit form maps well to the existing model, except `status`, which should remain a UI/admin-state concern for now rather than a database field.

---

## Recommended Status Strategy

### Recommendation: infer status from existing admin actions for now

Do **not** add a new database column in Sprint 06.

Instead, use lightweight status rules tied to the existing admin actions:

- when a game has been started via the existing `Start Game` action, show `ongoing`
- when `Clear Assignments` or `Reset Locations` is used, show `ready`
- otherwise show empty status

For the first implementation pass, this status can be maintained in the server-side admin flow without altering the schema. If later needed, it can be promoted to persisted operator metadata.

### Why this is the preferred approach

- it respects the request to avoid changing the data model right now
- it still gives operators immediate feedback on the list page
- it keeps Sprint 06 focused on management UI rather than migrations
- it leaves room for a future explicit status field if the workflow later needs stronger persistence or filtering

---

## Backlog Alignment

This sprint lines up directly with the open backlog item in [docs/backlog.md](../../backlog.md) about **experience-type configuration work**:

- define stable supported modes
- extend admin/editor UI for mode configuration
- document the `game.data` schema for operators

Sprint 06 should pull in the practical admin-facing part of that work by exposing `gametype`, `discoverable`, `mode`, and branding controls in one place.

It should **not** try to solve every future experience-type rule in this sprint; it should establish the first clean operator surface.

---

## Sprint Outcome Definition

Sprint 06 is complete when:

1. operators can see a practical current status of each game from the game admin list
2. operators can create a new game from a prominent button at the top of the list page
3. operators can open an existing game in edit mode from the actions menu
4. one shared create/edit page handles both new and existing games
5. the requested settings persist correctly to the database and existing branding structure
6. invalid form values are blocked with clear validation feedback
7. the revised flow is covered by focused tests and manual admin validation

---

## Design Principles

1. **One page for create and edit.** Avoid separate implementations unless the data flow truly diverges.
2. **Use explicit fields for first-class operator concepts.** Especially for `status`.
3. **Reuse existing patterns where they are already sound.** Especially image upload behavior.
4. **Keep the first version focused.** Core game settings first; location/team editing remains separate.
5. **Prefer operator clarity over cleverness.** The form should read like a small control panel, not a developer tool.

---

## Proposed Workstreams

## Phase 0 — Audit Current Game-Management Behavior

**Goal:** Confirm the current route, template, and data shape before modifying persistence and UI.

**Plan:**
- review how `/game_admin` is reached and who can access it
- confirm existing admin-only protections already in place
- inspect how `GameType` records are seeded and referenced
- confirm current branding expectations in base-template theming and API responses
- inventory whether the existing upload endpoint can safely store branding images for games

**Acceptance criteria:**
- we have a clear map of current game-admin entry points and dependencies
- the implementation path for branding upload and gametype selection is known before editing begins

---

## Phase 1 — Add Practical Game Status Display

**Goal:** Replace the list-page dummy `tbd` value with a useful inferred/admin-managed status.

**Plan:**
- define the first-pass display states as:
	- `ongoing` after `Start Game`
	- `ready` after `Clear Assignments`
	- `ready` after `Reset Locations`
	- empty otherwise
- update the relevant admin action handlers so these transitions are reflected in the admin UI flow
- update `/game_admin` rendering so the list page shows inferred/admin-managed status instead of placeholder text
- keep `complete` available in the create/edit UI as a planned operator-facing option, but do not force schema work in this sprint

**Acceptance criteria:**
- games with no status signal render with blank status
- after `Start Game`, the list can show `ongoing`
- after `Clear Assignments` or `Reset Locations`, the list can show `ready`
- no `tbd` placeholder remains in live UI

---

## Phase 2 — Improve the Game Admin List Page

**Goal:** Make the list page a real launching point for game management.

**Plan:**
- add a prominent `New Game` button near the page heading
- add `Edit game` to the actions dropdown for each row
- keep existing operational actions (`Start Game`, `Clear Assignments`, `Reset Locations`) intact unless they conflict
- decide whether status should display as plain text or as a small badge; plain text is acceptable for the first pass
- ensure the list still works cleanly on smaller screens

**Acceptance criteria:**
- `New Game` is visible without hunting through menus
- each game row has an obvious edit entry point
- the page still supports existing action-menu behavior

---

## Phase 3 — Add a Shared Game Create/Edit Page

**Goal:** Create one dedicated form page used for both new-game creation and editing existing games.

**Recommended routes:**
- `GET /game_admin/new`
- `POST /game_admin/new`
- `GET /game_admin/<game_id>/edit`
- `POST /game_admin/<game_id>/edit`

Alternative route names are acceptable, but the pattern should clearly communicate admin intent.

**Plan:**
- add a new template, likely under `app/templates/game/`
- use one shared form partial or one shared template for both create and edit modes
- include the minimum essential fields:
	- `name`
	- `discoverable`
	- `mode`
	- `status`
	- `gametype`
	- branding image
	- branding background color
	- optional hex text field mirroring the color picker
- pre-populate the form when editing an existing game
- keep success behavior simple:
	- save
	- flash success
	- return to game admin list or remain on edit page with confirmation

**Acceptance criteria:**
- one page supports both create and edit flows
- existing values appear correctly when editing
- successful saves are obvious to the operator

---

## Phase 4 — Implement Field Behavior and Data Mapping

**Goal:** Map the requested form controls cleanly onto the model and branding schema.

### 4.1 Discoverable toggle

**Requested values:** `no` / `public`

**Plan:**
- map directly to the existing `Game.discoverable` string field
- render as a toggle, segmented control, radios, or select, whichever fits existing UI style best
- normalize stored values to exactly `no` or `public`

### 4.2 Mode toggle

**Requested values:** `open` / `competitive`

**Plan:**
- map directly to `Game.mode`
- validate against allowed values only

### 4.3 Status dropdown

**Requested values:** empty / `ready` / `ongoing` / `complete`

**Plan:**
- include the control in the UI design, but defer true persistence until a later model change is approved
- for Sprint 06 implementation, prioritize list-page/admin-action derived status behavior first
- if a non-persistent form value is shown in the first pass, label behavior clearly so it does not imply saved historical state

### 4.4 Game type selector

**Requested values:** `findloc`, `map_hunt`

**Plan:**
- populate the dropdown from canonical `GameType` records
- ensure values align with the seeded game types in app startup
- validate the selected `GameType` exists before saving

### 4.5 Branding image upload

**Plan:**
- reuse the existing image-upload pattern if practical, ideally via [app/admin/routes.py](../../../app/admin/routes.py)
- store the resulting relative image path in `game.data['branding']['icon_url']`
- preserve or set a sensible `icon_alt` default if not explicitly edited in this sprint
- show a small preview if inexpensive to implement; otherwise, show the current filename/path

### 4.6 Branding background color

**Plan:**
- store the chosen value in `game.data['branding']['navbar_color']`
- provide both:
	- a native color picker
	- an optional hex text input
- keep both inputs synchronized so operators can paste a brand color directly
- validate hex format before saving

**Acceptance criteria:**
- every requested control maps to a clear target or is explicitly documented as deferred/non-persistent for now
- saved branding values continue to work with the existing base-template theming logic

---

## Phase 5 — Validation, Defaults, and UX Rules

**Goal:** Prevent broken or confusing admin input.

**Plan:**
- require `name`
- allow blank `status`
- reject unsupported `discoverable`, `mode`, or `gametype` values
- reject malformed color hex values in the text field
- handle branding upload failure without losing the rest of the form state
- decide a first-pass default set for `New Game`, recommended as:
	- `discoverable = public`
	- `mode = open`
	- `status = empty`
	- `gametype = findloc` or first canonical gametype if a more neutral default is preferred

**Acceptance criteria:**
- invalid input shows useful feedback
- new games get predictable defaults
- branding upload errors do not create partial silent failure

---

## Phase 6 — Tests and Validation

### Automated checks

Add or expand tests for:

- admin access protection for the new routes
- create flow saves `name`, `discoverable`, `mode`, `status`, and `gametype`
- edit flow updates those values correctly
- list page renders inferred/admin-managed status values
- `Start Game` updates the visible status to `ongoing`
- `Clear Assignments` updates the visible status to `ready`
- `Reset Locations` updates the visible status to `ready`
- branding JSON updates correctly when color and icon are changed
- invalid status/color/gametype values are rejected cleanly

### Manual validation

1. open `Game Mgmt` as an admin and confirm the `New Game` button is visible
2. create a game with each requested control populated
3. return to the list and confirm status renders correctly
4. open the same game via `Edit game` and confirm all values are prefilled
5. save changes and verify the list updates immediately after reload
6. confirm branding changes affect the visible themed shell when that game becomes active
7. verify legacy games without status still render cleanly

**Acceptance criteria:**
- new game-management routes are protected and stable
- operator-visible flows work end-to-end without manual DB edits

---

## Likely Files to Touch During Implementation

### Backend

- [app/main/routes.py](../../../app/main/routes.py)
	- add create/edit routes and form handling
	- update game-admin action handling/status derivation support
- possibly [app/admin/routes.py](../../../app/admin/routes.py)
	- reuse or lightly adapt image upload behavior if needed

### Templates

- [app/templates/game/game_admin.html](../../../app/templates/game/game_admin.html)
	- add `New Game`, real status rendering, and `Edit game`
- new template, likely:
	- `app/templates/game/game_form.html`
	- or `app/templates/game/game_edit.html`

### Frontend JavaScript

- [app/static/js/game_admin.js](../../../app/static/js/game_admin.js)
	- if needed for navigation or dropdown handling changes
- optional new JS file for color/hex synchronization and upload preview if that logic becomes non-trivial

### Tests

- likely a new focused test module such as:
	- `tests/test_game_admin.py`
	- or an expansion of existing admin/game tests if already present

---

## Risks and Guardrails

### Risk 1 — Status logic becomes over-engineered

**Guardrail:** keep status intentionally simple in Sprint 06: `Start Game` ⇒ `ongoing`; `Clear Assignments`/`Reset Locations` ⇒ `ready`; otherwise blank.

### Risk 2 — Branding upload creates a second inconsistent upload path

**Guardrail:** prefer reusing the existing image-upload pipeline rather than inventing a parallel one.

### Risk 3 — Form scope balloons into a full game editor

**Guardrail:** keep location/team/character editing out of this sprint.

### Risk 4 — Route file complexity grows further

**Guardrail:** if route additions become large, isolate helper functions or use a focused form-handling section rather than scattering logic.

---

## Recommended Delivery Order

1. finalize the no-migration status approach
2. update the list page to show real status and include `New Game` / `Edit game`
3. add the shared create/edit routes and template
4. wire form fields to the model and branding JSON
5. integrate branding upload
6. add tests and run admin/manual validation

This order gives visible progress early while keeping the model and persistence stable before the form gets larger.

---

## Definition of Done

- [x] `game_admin` no longer shows placeholder `tbd` status
- [x] `Start Game` causes the admin list to show `ongoing`
- [x] `Clear Assignments` causes the admin list to show `ready`
- [x] `Reset Locations` causes the admin list to show `ready`
- [x] `game_admin` has a visible `New Game` button
- [x] each game row offers an `Edit game` action
- [x] a shared create/edit page exists for new and existing games
- [x] discoverable toggle saves `no` / `public`
- [x] mode toggle saves `open` / `competitive`
- [x] status handling is clearly defined without changing the data model
- [x] game type dropdown saves `findloc` / `map_hunt`
- [x] branding image upload works for game branding
- [x] color picker and hex field stay in sync and persist correctly
- [x] existing theming logic still works with saved branding values
- [x] new routes are admin-protected
- [x] automated tests cover create/edit/list behavior
- [ ] manual admin validation confirms the operator flow is usable end-to-end

---

*End of Sprint 06 plan.*
