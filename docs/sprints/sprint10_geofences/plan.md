# Sprint 10 — Location Geofences and Proximity Messages

**Goal:** Add a lean, extensible geofence system that can trigger player-facing messages based on location, without forcing a schema migration in the MVP.

**Scope:** Planning and contract design for game-configured geofences attached to locations, with support for entry/exit messaging, team-level trigger tracking, and future expansion from circular to polygonal fences.

**Out of scope:** Full admin UI editing, polygon drawing tools, push notifications, background geofencing while the app is closed, and making geofences a required validation mechanism.

**Status:** Planned.

**Guiding decisions from this planning pass:**
- geofence behavior should be **attached logically to locations**
- MVP config should live in **`Game.data` JSON**, not new columns
- MVP should support **radial/circle fences first**
- polygon support should be planned for, but deferred
- geofence triggers should be **informational first**, not validation-blocking

**References:**
- [app/models.py](../../../app/models.py)
- [app/main/routes.py](../../../app/main/routes.py)
- [app/api/routes.py](../../../app/api/routes.py)
- [app/main/utils.py](../../../app/main/utils.py)
- [app/static/js/validate.js](../../../app/static/js/validate.js)
- [app/static/js/map.js](../../../app/static/js/map.js)
- [app/static/js/findloc.js](../../../app/static/js/findloc.js)
- [app/static/js/offline-game.js](../../../app/static/js/offline-game.js)
- [app/templates/findloc.html](../../../app/templates/findloc.html)
- [app/templates/map/play.html](../../../app/templates/map/play.html)

---

## Why This Sprint Exists

There are multiple useful ways to apply geofences in GeoKR beyond simple “you are close enough to validate” logic.

Examples:

- if a player **enters** an area, show a clue, warning, story beat, or hint
- if a player **leaves** an area, warn them they are going the wrong way
- if a player enters a staging zone, show setup instructions before they reach the exact clue
- if a player exits a search zone, remind them to return before wasting time

This is distinct from the existing validation flow:

- current “found” validation is mostly about whether the player is close enough to the target location
- proposed geofences are about **runtime behavior and messaging**, not necessarily about awarding progress

The codebase already has useful geo foundations:

- server-side distance checks in [app/api/routes.py](../../../app/api/routes.py#L166-L198) and [app/api/routes.py](../../../app/api/routes.py#L456-L549)
- shared haversine helpers in [app/main/utils.py](../../../app/main/utils.py) and [app/static/js/map.js](../../../app/static/js/map.js)
- existing location payloads for both `findloc` and `map` modes
- offline state handling patterns in [app/static/js/offline-game.js](../../../app/static/js/offline-game.js)

So Sprint 10 should not start with schema work. It should define a stable MVP contract that fits the current JSON-driven configuration style.

---

## Product Outcome for Sprint 10

This sprint should define and prepare the first usable geofence behavior model:

1. geofences are attached conceptually to a location
2. geofence definitions live in `Game.data` for MVP
3. one location may have multiple geofence rules
4. rules support **enter** and **exit** triggers
5. rules can show a player-facing message
6. rules support throttling / cooldown to avoid spam
7. rules can be once-per-team or repeatable
8. circle/radius fences are the MVP shape
9. polygon fences are reserved for a future phase

---

## Recommended MVP Architecture

### Store geofence definitions in `Game.data`

Recommended top-level JSON key:

- `game.data['geofences']`

Use location ids as keys so the feature is attached to locations without adding a new table yet.

Recommended shape:

```json
{
	"geofences": {
		"123": [
			{
				"id": "arrival-hint",
				"enabled": true,
				"shape": "circle",
				"center": { "lat": 44.22247, "lon": -88.5161 },
				"radius_m": 75,
				"trigger": "enter",
				"message": "You are getting close. Look near the stone wall.",
				"cooldown_s": 300,
				"once_per_team": true,
				"priority": 100
			},
			{
				"id": "leave-warning",
				"enabled": true,
				"shape": "circle",
				"center": { "lat": 44.22247, "lon": -88.5161 },
				"radius_m": 150,
				"trigger": "exit",
				"message": "You are leaving the search area.",
				"cooldown_s": 180,
				"once_per_team": false,
				"priority": 50
			}
		]
	}
}
```

### Track trigger history in `Team.data`

Recommended team-side storage:

- `team.data['geofence_state']`

Suggested shape:

```json
{
	"geofence_state": {
		"arrival-hint": {
			"last_triggered_at": "2026-04-07T14:33:21Z",
			"times_triggered": 1,
			"last_transition": "enter"
		},
		"leave-warning": {
			"last_triggered_at": "2026-04-07T14:48:02Z",
			"times_triggered": 3,
			"last_transition": "exit"
		}
	}
}
```

Why this split works:

- `Game.data` stores reusable game configuration
- `Team.data` stores team-specific runtime history
- no schema migration is required for MVP
- later migration to real tables remains possible

---

## Draft Contracts

## 1. Geofence Definition Contract

Each geofence object should support:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | unique within the game; stable identifier for trigger tracking |
| `enabled` | bool | no | default `true` |
| `shape` | string | yes | MVP supports `circle`; reserve `polygon` for future |
| `center` | object | yes for circle | `{ lat, lon }` |
| `radius_m` | number | yes for circle | radius in meters |
| `points` | array | future | polygon vertices for future phase |
| `trigger` | string | yes | `enter` or `exit` |
| `message` | string | yes | player-facing text |
| `cooldown_s` | int | no | default suggested `300` |
| `once_per_team` | bool | no | default `false` |
| `priority` | int | no | helps resolve multiple eligible messages |
| `metadata` | object | no | future extensibility |

### Valid MVP values

```json
{
	"shape": "circle",
	"trigger": "enter"
}
```

Future-compatible values:

```json
{
	"shape": "polygon",
	"trigger": "exit"
}
```

---

## 2. Runtime Evaluation Result Contract

When the client or server evaluates geofences, it should normalize results into a common structure.

Suggested internal contract:

```json
{
	"location_id": 123,
	"fence_id": "arrival-hint",
	"triggered": true,
	"transition": "enter",
	"message": "You are getting close. Look near the stone wall.",
	"priority": 100,
	"cooldown_blocked": false,
	"already_seen": false
}
```

This is useful even if MVP only uses it in JS first.

---

## 3. Client Payload Contract

If the browser sends geofence evaluation to the server, use a lightweight payload like:

```json
{
	"game_id": 12,
	"team_id": 34,
	"latitude": 44.22247,
	"longitude": -88.5161,
	"transitions": [
		{
			"location_id": 123,
			"fence_id": "arrival-hint",
			"transition": "enter"
		}
	]
}
```

MVP may not need this immediately if all detection stays client-side, but documenting it now avoids future ad hoc shapes.

---

## 4. Popup Message Contract

Suggested frontend-ready message object:

```json
{
	"type": "geofence",
	"title": "Nearby clue",
	"message": "You are getting close. Look near the stone wall.",
	"severity": "info",
	"dismissible": true,
	"fence_id": "arrival-hint",
	"location_id": 123
}
```

MVP can simplify this to message text only, but this structure leaves room for severity and styling later.

---

## Recommended MVP Behavior Rules

### 1. Circle fences first

Circle fences are the right first step because:

- your codebase already has distance helpers
- they are easy to reason about and test
- they are easy to author manually in JSON
- they are easier than polygons for admin UX

### 2. Informational only for MVP

MVP geofences should **not** block validation or advance game state.

They should only:

- show messages
- optionally be recorded in team state

Why:

- much lower product risk
- easier to test
- avoids edge cases with GPS jitter causing false negative gameplay blocks

### 3. Trigger on transitions, not continuous position alone

Use the idea of transitions:

- `enter`: outside → inside
- `exit`: inside → outside

This is better than “fire whenever inside” because otherwise the same message can repeat constantly.

### 4. Enforce cooldowns

Even transition-based logic should still apply cooldowns, because GPS jitter near the edge can create noisy enter/exit flipping.

Also, some fences should be allowed to re-notify the player while they remain in the same broad situation.

Examples:

- player remains outside the intended zone for several minutes
- player remains inside a staging zone and has not acted yet
- player crosses the boundary once, but the original toast is missed or dismissed

So Sprint 10 should support **repeat reminders**, not just one-time transition messages.

### 5. Track once-per-team separately from cooldown

`once_per_team` and `cooldown_s` solve different problems:

- `once_per_team=true` means story beat only once
- `cooldown_s=300` means repeatable but not spammy

### 6. Add optional sustained-state reminders

To avoid missing important informational events, geofences should support a second concept beyond transition triggers:

- **transition trigger**: fire on `enter` or `exit`
- **state reminder**: while still `inside` or still `outside`, fire again after a reminder interval

This keeps the feature non-blocking but makes it reliable enough for guidance.

Recommended MVP addition:

| Field | Type | Required | Notes |
|---|---|---|---|
| `repeat_while` | string/null | no | `inside`, `outside`, or omitted |
| `repeat_every_s` | int/null | no | minimum seconds between repeated reminders while state remains true |

Example:

```json
{
	"id": "search-zone-warning",
	"enabled": true,
	"shape": "circle",
	"center": { "lat": 44.22247, "lon": -88.5161 },
	"radius_m": 150,
	"trigger": "exit",
	"message": "You are outside the search area.",
	"cooldown_s": 60,
	"repeat_while": "outside",
	"repeat_every_s": 180,
	"once_per_team": false
}
```

---

## Transition Logic Draft

For each tracked fence, keep prior inside/outside state for the team during active play.

Suggested runtime logic:

1. compute whether current player position is inside the fence
2. compare to last known inside/outside state
3. if state changed:
	 - outside → inside = `enter`
	 - inside → outside = `exit`
4. if the fence's configured `trigger` matches the transition, evaluate:
	 - is fence enabled?
	 - has `once_per_team` already fired?
	 - is cooldown still active?
5. if no transition fired, evaluate sustained-state reminder rules:
	- is `repeat_while` configured?
	- is the player still in the matching state?
	- has `repeat_every_s` elapsed since the last reminder?
6. if allowed, emit popup message and persist state

Suggested team runtime state shape:

```json
{
	"geofence_runtime": {
		"arrival-hint": {
			"inside": true,
			"last_evaluated_at": "2026-04-07T14:33:21Z",
			"last_transition_at": "2026-04-07T14:31:00Z",
			"last_reminder_at": "2026-04-07T14:33:21Z",
			"current_state": "inside"
		}
	}
}
```

This can stay ephemeral in client memory for MVP, but documenting the shape helps if server sync is added later.

---

## Polling and Reliability Recommendation

Yes — polling is the right MVP approach.

Recommended cadence:

- normal foreground polling: every `20` seconds
- faster follow-up only if the player is near a fence boundary: optional future optimization
- no background polling when the app/tab is inactive in MVP

Why `20` seconds is a good default:

- frequent enough that players are unlikely to miss an area change for long
- not so frequent that it creates excessive battery drain or popup churn
- simple enough to reason about for both `findloc` and map mode

Recommended implementation pattern:

1. get current GPS fix
2. evaluate all active fences for the game
3. emit any eligible transition or reminder events
4. store the latest inside/outside state in client memory
5. persist important trigger history to `Team.data` on a coarse-grained basis

### Suggested polling config

For MVP, add a game-level config block:

```json
{
	"geofence_settings": {
		"poll_interval_s": 20,
		"default_cooldown_s": 300,
		"default_repeat_every_s": 180,
		"enabled": true
	}
}
```

This keeps cadence configurable without adding columns.

---

## GUI State Recommendation

Even though geofences are non-blocking, the GUI should expose state eventually.

Recommended UI-facing per-location state:

```json
{
	"location_id": 123,
	"geofence_state": {
		"inside_any": true,
		"active_messages": ["arrival-hint"],
		"last_transition": "enter",
		"last_transition_at": "2026-04-07T14:31:00Z",
		"last_reminder_at": "2026-04-07T14:33:21Z"
	}
}
```

Possible future UI uses:

- show a subtle “in zone” badge
- show “outside search area” warning banner
- highlight current clue card when in the intended area
- surface recent geofence hints in a message log

For MVP, the UI can simply:

- show toast/banner popups
- keep geofence state in memory
- later reflect that state in clue-card styling

---

## Phase Plan

## Phase 0 — Define Contracts and Helper Surface

**Goal:** Lock down the JSON structure before coding behavior.

**Plan:**
- define the `Game.data['geofences']` contract
- define team trigger-tracking shape in `Team.data`
- decide default behavior for omitted fields
- decide whether MVP evaluation is client-side only or client + server recorded

**Acceptance criteria:**
- a written contract exists
- a developer can add a sample geofence manually without guessing field names

---

## Phase 1 — Add Model Helpers Only

**Goal:** Create helpers without changing schema.

**Recommended helpers on `Game`:**
- `get_geofence_config()`
- `get_location_geofences(location_id)`
- `set_location_geofences(location_id, fences)`
- `iter_enabled_geofences()`

**Recommended helpers on `Team`:**
- `get_geofence_state()`
- `mark_geofence_triggered(fence_id, transition, timestamp=None)`
- `was_geofence_triggered(fence_id)`
- `get_geofence_runtime_state()`

**Acceptance criteria:**
- geofence config can be read/written through helpers
- helpers normalize missing or malformed JSON safely

---

## Phase 2 — Add Runtime Evaluation Helpers

**Goal:** Centralize geofence math and rule checks.

**Recommended helpers:**

In Python or shared utility layer:
- `point_in_circle(lat, lon, center_lat, center_lon, radius_m)`
- future: `point_in_polygon(lat, lon, points)`
- `evaluate_geofence_transition(previous_inside, current_inside)`
- `is_geofence_trigger_allowed(fence, team_state, now)`

In JavaScript for gameplay polling:
- `isPointInsideCircle(...)`
- future `isPointInsidePolygon(...)`

**Acceptance criteria:**
- circle evaluation is deterministic
- trigger eligibility is separated from geometry

---

## Phase 3 — Wire into Active Play UI

**Goal:** Show popup messages in gameplay.

**Recommended first target:** `findloc`

Why:
- already has active clue UI and validation flow
- easier to start with one screen

**Possible later target:** `map/play`

**Plan:**
- load relevant geofence data into `GAME_DATA`
- poll player location on a reasonable interval (recommended default `20s`)
- detect transitions client-side
- detect sustained-state reminders client-side
- show message popup/toast/modal when a rule triggers
- avoid duplicate popups during cooldown
- expose non-blocking geofence state in the GUI model for later rendering

**Acceptance criteria:**
- entering or exiting a configured circle can trigger a message once per configured rules
- remaining inside/outside a configured fence can trigger additional reminders per configured rules
- repeated GPS polls do not spam the player

---

## Phase 4 — Persist Trigger History

**Goal:** Track enough state to support once-per-team and cooldown behavior across sessions.

**Plan:**
- choose persistence point in `Team.data`
- update state after valid trigger
- decide whether writes happen immediately or piggyback on existing sync APIs

**Acceptance criteria:**
- once-per-team fences do not refire after reload
- cooldowns survive page refresh if desired

---

## Phase 5 — Add Admin Editing Later

**Goal:** Make geofences manageable without hand-editing JSON.

**Deferred UI ideas:**
- simple location-level geofence editor in Manage Locations
- radial fence fields:
	- trigger type
	- center lat/lon
	- radius
	- message
	- cooldown
	- once-per-team
- later polygon editor using map clicks

**Acceptance criteria for future phase:**
- organizers can add/edit/delete fences without manual JSON work

---

## Defaults and Validation Rules

Recommended default assumptions for MVP:

| Field | Default |
|---|---|
| `enabled` | `true` |
| `shape` | required |
| `trigger` | required |
| `cooldown_s` | `300` |
| `once_per_team` | `false` |
| `priority` | `0` |

Recommended validation rules:

- `shape` must be one of allowed values
- `trigger` must be `enter` or `exit`
- `radius_m` must be positive for circles
- `center.lat` and `center.lon` must be valid numbers
- `id` must be unique within the game
- `message` must not be empty

---

## Lean MVP Recommendations

If the goal is to stay lean, do **not** build everything at once.

Best first slice:

1. JSON contract in `Game.data`
2. circle fences only
3. `enter` and `exit`
4. informational popup only
5. once-per-team + cooldown support
6. one gameplay screen first, likely `findloc`

Avoid in MVP:

- polygon editing UI
- validation-blocking rules
- background geofencing
- server-heavy continuous evaluation
- lots of severity types and workflow branching

---

## Open Questions to Resolve During Implementation

1. Should geofences be evaluated only for the current active clue, or for all assigned locations?
	 - recommendation: all enabled fences for the active game, but prioritize current-clue fences if both trigger

2. Should `findloc` and `map` both support geofence popups in Sprint 10?
	 - recommendation: start with `findloc` only

3. Should trigger history be written immediately to the server, or kept client-side until a sync event?
	 - recommendation: client-side first if purely informational; server-side persistence when once-per-team needs durability

4. Should geofence messages be modal, toast, or inline card?
	 - recommendation: toast/banner first; modal only for major story beats

---

## Suggested Acceptance Test Scenarios

### Contract / helper tests

- missing geofence config returns empty set
- invalid shapes are ignored or rejected cleanly
- duplicate ids are detected

### Geometry tests

- point inside circle returns true
- point outside circle returns false
- edge-of-radius behavior is defined consistently

### Trigger tests

- outside → inside fires `enter`
- inside → outside fires `exit`
- no transition does not fire
- cooldown suppresses repeated triggers
- once-per-team suppresses second trigger

### Gameplay tests

- entering a configured area shows expected message
- exiting a configured area shows expected message
- repeated GPS polling does not spam popups

---

## Final Recommendation

For Sprint 10, the right plan is:

- attach geofence behavior logically to locations
- store definitions in `Game.data['geofences']`
- track fired state in `Team.data`
- ship circle fences only in MVP
- support `enter` and `exit`
- make the first version informational, not validation-blocking

That gives GeoKR a flexible location-triggered message system without committing early to new schema, complex admin tools, or polygon geometry before the feature proves itself.
