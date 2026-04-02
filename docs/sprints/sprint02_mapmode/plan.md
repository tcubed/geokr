# Sprint 02 — Map Mode Game Experience

**Goal:** Activate the map-hunt game type so that organizers can configure a game where players navigate to locations using a live map rather than following sequential clue text.

**Scope:** Backend routing, route template, proximity-triggered "found" flow. No changes to the `findloc` (route mode) experience. No offline sync (Sprint B). No UI redesign.

**Reference:** Historical backlog item "Sprint A — Map-Mode Game Experience" in [docs/backlog.md](../../backlog.md).

**Status:** Implemented and validated on March 30, 2026.

**Validation:** `pytest tests/ -v` → **39 passed, 0 failed**.

**Implementation notes:**
- Seeded canonical `GameType` records in `create_app()`.
- Activated gametype-aware dispatch in `index()`.
- Added `/map` route and `map/play.html` template.
- Reused the existing `/api/location/<id>/found` flow from the map UI.
- Added Sprint 02 regression coverage in `tests/test_map_mode.py`.
- Fixed `get_active_team()` to validate membership by query/IDs rather than ORM instance identity, which was causing incorrect team fallback across request/session boundaries.

---

## Background: What Already Exists

| Asset | Location | State |
|---|---|---|
| Map game template | `app/templates/main.html` | Has Leaflet layout, "Check for Clues" button, game bounds JS vars — but receives no location data from route |
| Map JS module | `static/js/map.js` | Geolocation tracking, haversine, Leaflet `showMap()` — functional |
| `/main` route | `app/main/routes.py` | Passes `team` and `game` to template but **no location assignments** |
| Gametype dispatcher | `app/main/routes.py` `index()` | Commented out — currently hard-redirects everyone to `findloc` |
| `GameType` model | `app/models.py` | Exists with FK on `Game`; no seed data yet |
| `show_pin` column | `Location` model | Nullable boolean — intended to control map pin visibility per location |
| Tile-list API | `/api/tile-list` | Functional — returns OSM tile URLs for a bounding box |
| Debug map | `app/templates/map/debug.html` | Shows cached tiles — useful for admin/testing |

---

## Phase 0 — Seed `GameType` Records

**Completed:** Added idempotent seeding in [app/__init__.py](../../../app/__init__.py) so fresh environments automatically get `findloc` and `map_hunt`.

The `GameType` table is empty in a fresh DB. Seed two canonical values so the admin panel and dispatcher have something to work with.

**Canonical names (case-sensitive, used in the dispatcher):**
- `findloc` — existing route mode (sequential clues)
- `map_hunt` — new map-based mode

**How:** Add a `ensure_gametypes()` helper called from `create_app()` inside `app_context`, or run it manually via Flask shell once per environment:

```python
from app.models import db, GameType
for name in ['findloc', 'map_hunt']:
    if not GameType.query.filter_by(name=name).first():
        db.session.add(GameType(name=name))
db.session.commit()
```

Alternatively, add this to the existing `db.create_all()` block in `__init__.py` with a guard so it's idempotent.

---

## Phase 1 — Activate Gametype Dispatcher in `index()`

**Completed:** `index()` now dispatches authenticated players by active team gametype:
- `findloc` → `main.findloc`
- `map_hunt` → `main.map_page`
- missing/unknown gametype → warning + account page

**File:** `app/main/routes.py`

Currently `index()` hard-redirects everyone to `findloc` regardless of game type. The dispatcher logic is already written but commented out.

**Fix:** Replace the hard redirect with the gametype-aware dispatch. Supported values:

| `gametype.name` | Redirect target |
|---|---|
| `findloc` | `main.findloc` |
| `map_hunt` | `main.map_page` *(new — Phase 2)* |
| anything else / None | flash warning → `main.account` |

```python
@main_bp.route('/')
def index():
    if not current_user.is_authenticated:
        return redirect(url_for('auth.register_or_login'))

    team = get_active_team(current_user)
    if not team:
        return redirect(url_for('main.account'))

    gametype = team.game.gametype.name.lower() if (team.game and team.game.gametype) else None

    if gametype == 'findloc':
        return redirect(url_for('main.findloc'))
    elif gametype == 'map_hunt':
        return redirect(url_for('main.map_page'))
    else:
        flash("No active game type configured for your team.", "warning")
        return redirect(url_for('main.account'))
```

---

## Phase 2 — Build the `map_page` Route

**Completed:** Added `/map` as a new route alongside the legacy `/main` route.

**Actual delivered behavior:**
- Loads the active team and game
- Pulls ordered `TeamLocationAssignment` rows
- Passes `locations` with `id`, `name`, `lat`, `lon`, `clue_text`, `image_url`, `found`, and `show_pin`
- Computes `found_count`, `total_count`, and optional completion duration
- Renders `map/play.html`

**File:** `app/main/routes.py`

Rename / repurpose the existing `main_page` (`/main`) route to `map_page`. It currently passes `team` and `game` only. It needs to pass the same location assignment data that `findloc` passes, but without forcing sequential order — all assigned locations are potentially visible on the map simultaneously (subject to `show_pin`).

```python
@main_bp.route('/map')
@login_required
def map_page():
    team = get_active_team(current_user)
    if not team:
        flash('You must join or create a team to play.', 'info')
        return redirect(url_for('main.account'))

    game = team.game
    assignments = (
        TeamLocationAssignment.query
        .filter_by(team_id=team.id)
        .order_by(TeamLocationAssignment.order_index)
        .all()
    )

    locations = []
    for assignment in assignments:
        loc = assignment.location
        img_url = url_for('static', filename=f'images/{loc.image_url}') if loc.image_url else None
        locations.append({
            "id": loc.id,
            "name": loc.name,
            "lat": float(loc.latitude) if loc.latitude is not None else None,
            "lon": float(loc.longitude) if loc.longitude is not None else None,
            "clue_text": loc.clue_text,
            "image_url": img_url,
            "found": assignment.found,
            "show_pin": loc.show_pin,   # None = use game default; True/False = explicit
        })

    found_count = sum(1 for l in locations if l['found'])
    completion_duration = (
        team.end_time - team.start_time if team.end_time and team.start_time else None
    )

    return render_template(
        'map/play.html',
        game=game,
        team=team,
        locations=locations,
        found_count=found_count,
        completion_duration=str(completion_duration) if completion_duration else None,
    )
```

Keep the `/main` legacy route pointing to `main.html` until it can be retired cleanly — just add the new `/map` route alongside it.

---

## Phase 3 — Build `map/play.html` Template

**Completed:** Created [app/templates/map/play.html](../../../app/templates/map/play.html).

**Actual delivered behavior:**
- Full-screen Leaflet map
- HUD progress display
- Pins rendered from `locations`
- Green styling for found locations, blue for unfound
- Popup clue text + **"I'm Here"** action
- Bounds fit from `game.min_lat`, `game.max_lat`, `game.min_lon`, `game.max_lon`
- Browser geolocation tracking with live user marker

**File:** `app/templates/map/play.html`

Base this on `main.html` (the existing map template skeleton) but wire it with real location data.

**Key elements:**
- Extends `base.html`
- Full-height Leaflet map (same flex layout as `main.html`)
- Progress bar: `X of N found`
- For each location in `locations`:
  - If `show_pin` is `True` (or `None` and game default is to show): drop a pin on the map
  - If already `found`: green pin; if not found: default/blue pin
  - Tapping a pin shows a popup with the clue text and a **"I'm Here"** button
- The **"I'm Here"** button calls the existing `/api/location/<id>/found` endpoint (POST with current lat/lon)
- On success: pin turns green, progress bar updates, check for completion
- Completion screen: same "You Finished!" flash as `findloc`

**JS wiring:**
- Import `map.js` for `initGeo`, `startTracking`, `haversine`
- Pass `GAME_DATA` with locations array (same pattern as `findloc.html` uses for `GAME_DATA`)
- Use `game.min_lat`, `game.max_lat`, `game.min_lon`, `game.max_lon` to fit map bounds on load

**`show_pin` logic:**

| `show_pin` value | Behaviour |
|---|---|
| `True` | Always show pin |
| `False` | Never show pin (player must navigate by clue text only) |
| `None` | Use game-level default — suggest `True` for map_hunt |

---

## Phase 4 — Proximity Check & "Found" on the Map

**Completed:** Wired the map popup button to the existing `/api/location/<id>/found` endpoint.

**Actual delivered behavior:**
- Sends `{ game_id, lat, lon }`
- Marks location found on success
- Updates marker colour and HUD progress
- Shows completion state when the team is done

The existing `/api/location/<int:location_id>/found` endpoint already handles:
- Proximity check (30m threshold)
- Idempotent found marking
- Team completion detection
- `build_progress_response` JSON response

No backend changes needed for basic map-hunt found flow. The JS just needs to call it correctly:

```javascript
async function markFound(locationId, lat, lon, gameId) {
  const resp = await fetch(`/api/location/${locationId}/found`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_id: gameId, lat, lon })
  });
  const data = await resp.json();
  if (resp.ok) {
    updatePinToFound(locationId);
    updateProgressBar(data.team_progress);
    if (!data.next_location) showCompletionScreen();
  } else {
    showToast(data.message || 'Too far away');
  }
}
```

---

## Phase 5 — Admin: Set GameType on a Game

**Completed:** No code changes required. Documented operator dependency:
- Admin must set a game's `gametype` to `map_hunt` in Flask-Admin.
- Automatic seeding now ensures the dropdown has both canonical values available.

Organizers need a way to assign `gametype = map_hunt` to a game. Flask-Admin already has `GameAdmin` with a `gametype` field in the form. No code changes needed — just documentation for the operator.

Verify the Flask-Admin `GameAdmin` form shows the `gametype` dropdown correctly by testing with a seeded `map_hunt` GameType.

---

## Phase 6 — Tests

**Completed:** Added [tests/test_map_mode.py](../../../tests/test_map_mode.py).

**Coverage added:**
- `GameType` seeding for `findloc` and `map_hunt`
- Dispatcher redirect for `map_hunt`
- Dispatcher redirect for `findloc`
- Anonymous `/map` redirect
- Authenticated no-team redirect
- Authenticated `/map` render success
- `GAME_DATA` present in rendered page
- `show_pin` present in rendered location payload
- Progress text present in rendered page

**Test implementation note:** These tests authenticate through the real `/register_or_login` flow rather than mutating the session directly.

Add tests to `tests/test_map_mode.py`:

- `GameType('map_hunt')` seeds correctly and is retrievable
- `index()` with a `map_hunt` team redirects to `/map`
- `GET /map` with a valid team returns 200
- `GET /map` with no team redirects to account
- Locations JSON passed to template includes `show_pin` field
- `POST /api/location/<id>/found` (existing test from Sprint 01 covers auth, extend here for happy-path proximity check)

---

## Phase 7 — Commit and Tag `v1.1.0-map-mode`

**Manual remaining step:** code and tests are complete; commit/tag/push still needs to be run.

```bash
git add -A
git commit -m "feat: map_hunt game type — /map route, play.html template, gametype dispatcher"
git tag v1.1.0-map-mode
git push origin v1.1.0-map-mode
```

---

## Checklist

- [x] Phase 0 — Seed `findloc` and `map_hunt` `GameType` records
- [x] Phase 1 — Activate gametype dispatcher in `index()`
- [x] Phase 2 — Add `map_page` route (`/map`) with location assignments
- [x] Phase 3 — Create `map/play.html` template
- [x] Phase 4 — Wire JS "I'm Here" button to `/api/location/<id>/found`
- [x] Phase 5 — Verify Flask-Admin GameType dropdown works; document operator flow
- [x] Phase 6 — Add `tests/test_map_mode.py`
- [ ] Phase 7 — Commit and tag `v1.1.0-map-mode`

---

## Out of Scope (Deferred)

- Offline map tile prefetch for map_hunt (Sprint B)
- Free-roam mode (all pins visible simultaneously, no route)
- QR-only validation
- Route reorganization / `main/routes.py` split
- `main.html` / `/main` route cleanup — keep until `map/play.html` is stable and tested
