# GeoKR Backlog

This document holds follow-up backlog items that were previously mixed into review notes.

Use it alongside:

- [review-0330.md](review-0330.md) for the March 30 product/code review
- [design/game_flow.md](design/game_flow.md) for the offline/operator flow
- sprint plans under [sprints/](sprints/) for implementation detail

---

## Carryover Product / Engineering Items

### High-value open items

1. **Camera fallback / admin-confirm path**
   - Add a reliable fallback when camera/selfie capture fails during play.
   - Prefer a path that does not strand players on a broken browser camera flow.
   - Status: open.

2. **`teams/routes.py` cleanup**
   - Either finish the `join_team` stub or remove the route/module from the MVP path.
   - Status: open.

3. **Shared auth/admin decorators**
   - Move duplicated `admin_required` logic into a shared decorators module.
   - Status: open.

4. **`password_hash` migration decision**
   - Either remove the unused field if magic-link remains the long-term auth path, or explicitly reintroduce password auth as a supported mode.
   - Status: deferred architectural decision.

---

## Historical Sprint Backlog Extracted from the March 30 Review

### Sprint A — Map-Mode Game Experience

**Original intent:** add a map-based game type where players navigate via pins instead of only sequential clue text.

**Status:** completed.

**Delivered reference:** [sprints/sprint02_mapmode/plan.md](sprints/sprint02_mapmode/plan.md)

**Remaining optional follow-up:**
- retire or repurpose legacy `/main`
- decide whether `show_pin = None` should map to a formal game default
- add more operator-facing polish and screenshots

---

### Sprint B — Asset Prefetch & Offline-First Play

**Original intent:** let players pre-download game assets, play through poor connectivity, and sync progress later.

**Status:** implemented through Sprint 03 phases, with manual release/tag step still separate.

**Delivered references:**
- [sprints/sprint03_prefetch_offline/plan.md](sprints/sprint03_prefetch_offline/plan.md)
- [sprints/sprint03_prefetch_offline/validation-matrix.md](sprints/sprint03_prefetch_offline/validation-matrix.md)
- [design/game_flow.md](design/game_flow.md)

**Remaining operational work:**
- execute the manual/device/rehearsal validation matrix
- perform release/tag work when ready

---

### Sprint C — Reduce Cellular Data Drain

**Goal:** reduce live data usage during events.

**Recommended backlog items:**
- serve Bootstrap / Leaflet / icons from local static assets where possible
- compress and resize uploaded location images automatically
- continue using tile prefetch instead of live tile fetch during play
- add caching headers for static assets
- add response compression

**Status:** proposed.

---

### Sprint D — Multiple Experience Types

**Goal:** allow organizers to choose among route, map-hunt, free-roam, or QR-led experiences without code edits.

**Recommended backlog items:**
- define stable supported modes
- formalize per-game config schema
- extend admin/editor UI for mode configuration
- map `enable_*` gameplay flags cleanly to configured experience type
- document the `game.data` schema for operators

**Status:** proposed.

---

## Prioritization Suggestion

If choosing only a few next items, the strongest order is:

1. camera fallback / admin-confirm path
2. `teams/routes.py` cleanup
3. local static asset delivery + image compression
4. experience-type configuration work

---

*End of backlog.*
