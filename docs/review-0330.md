# GeoKR App Review — March 30, 2026

**Reviewer:** GitHub Copilot  
**App:** GeoKR / GeoGame — location-based team scavenger hunt  
**Status at review:** Post-beta-1, targeting MVP+  

> **Sprint 01 (Security Hardening) completed March 30, 2026 — tagged `v1.0.1-security`.**  
> Immediate follow-up items from this review now live in [docs/backlog.md](backlog.md). See [docs/sprints/sprint01_security/plan.md](sprints/sprint01_security/plan.md).  
>
> **Sprint 02 (Map Mode Game Experience) completed in code and tests on March 30, 2026.**  
> The `map_hunt` game type is now seeded, dispatched from `index()`, rendered at `/map`, and covered by regression tests. Release/tag step remains manual. See [docs/sprints/sprint02_mapmode/plan.md](sprints/sprint02_mapmode/plan.md).

---

## 1. Overall Impression

The app is in a solid, functional state. The first beta run reportedly went without major incidents, which is the most important early signal. The architecture reflects a developer who has been iterating thoughtfully: dead code is commented out rather than deleted, the data model is flexible, and there are signs of planned features (offline sync, map mode, QR, image verification) that are partially wired but correctly gated. The fundamentals are sound enough to call this an MVP with a few caveats noted below.

---

## 2. Code Organization

### Strengths

- **Blueprint separation** is done correctly. `main`, `auth`, `admin`, `api`, and `teams` are distinct packages registered through `blueprints.py`. This is the right structure for Flask at this scale.
- **`models.py` is clean and self-contained.** The data model — `Game → Location → TeamLocationAssignment ← Team → User` — is normalized and expressive. The addition of `MutableDict` on `Team.data` and the JSON blob on `Game.data` gives you the flexibility to store per-game branding and route configs without schema churn. That was a smart call.
- **`utils.py` and `cache.py`** are small, focused files. `haversine` and tile-URL generation belong exactly there.
- **`config.py`** properly separates `DevConfig` / `ProdConfig` from `BaseConfig`.
- The service worker (`service-worker.js`) and the JS modules (`offline-db.js`, `offline-sync-sw.js`, `offline-game.js`, etc.) are already namespaced sensibly.

### Issues / Concerns

- **`app/main/routes.py` is 1,018 lines.** This is the main pressure point. It contains: game page rendering, account management, `api_joingame`, image upload, session management, game joining flow, and a partially-commented routing dispatcher. At this size it is harder to navigate, test, or hand off. Suggest splitting into at minimum: `routes_game.py`, `routes_account.py`, `routes_misc.py` once MVP stabilizes.
- **`app/api/routes.py` is 889 lines.** This includes: proximity checking, location assignment, tile-list generation, selfie/image validation, sync logic, and the `get_game_status_data` function (which is imported into `main/routes.py` — a cross-blueprint import). This circular dependency is fragile. A shared `services/` layer would be the clean fix.
- **`app/teams/routes.py`** is nearly a stub — `join_team` does nothing. Either it should be removed for the MVP or finished. Having a route that returns a flash message without any logic is a potential source of user-facing confusion.
- **`deprecated/` and `archive/`** exist in the workspace root, which is fine for a solo project but may confuse collaborators. Consider moving to a `_archive/` folder excluded from version control, or just deleting if no longer needed.
- Commented-out code blocks in `routes.py` are extensive. They represent the evolution of the routing decisions (gametype-based dispatch, join-game flow) and are valuable as history, but they add noise. Once stable, clean them up or move them to a change log.

---

## 3. Authentication & Login

### Approach

The app uses **magic-link email authentication** via `itsdangerous.URLSafeTimedSerializer`. There is no password login (the `password_hash` column on `User` exists but is unused). Registration creates a user record, then login triggers an email link with a 15-minute expiry.

### Strengths

- Magic link is the right UX choice for a mobile-first, non-technical audience. No password to forget, works well in a group event setting.
- The `register_or_login` combined route is a good UX simplification — one step for new and returning users.
- There is a `generate_resume_token` / `verify_resume_token` pair (30-day expiry) intended for offline resume. This is a thoughtful addition — users don't have to re-authenticate after leaving the app.
- Role system (`Role`, `UserRole`) is lightweight but functional. `is_admin` property on `User` is convenient.
- `LoginManager.login_view` is set, so unauthenticated access redirects cleanly.
- Session cookie settings (`HTTPONLY`, `SAMESITE=Lax`) are configured correctly.

### Concerns

- ~~**`SECRET_KEY` hardcoded in `__init__.py`**~~ ✅ *Fixed in Sprint 01 — line removed.*
- ~~**`SESSION_COOKIE_SECURE = False`** in both Dev and Prod configs~~ ✅ *Fixed in Sprint 01 — `ProdConfig` now sets both secure cookie flags to `True`.*
- **Email dependency as a hard gate:** If `Flask-Mail` misconfigures (bad SMTP creds, email provider blocks, etc.), the user simply cannot log in. There is no fallback. For a beta/event context you may want an admin-bypass mechanism (e.g., a signed URL that skips mail send) for when players are on-site.
- The `serializer` in `auth.py` is instantiated at module import time using `current_app.config['SECRET_KEY']` — this works only because of Flask's application context, but it's subtle. It will silently fail if ever imported outside an app context during testing.
- ~~`/load_sample_data` in `admin/routes.py` uses HTTP Basic Auth with hardcoded credentials (`admin` / `secret`)~~ ✅ *Fixed in Sprint 01 — Basic Auth stub removed; all admin routes now protected by `@admin_required`.*

---

## 4. Separation of Concerns

### What's Working

- The **service worker** properly handles three cache domains: app shell, tiles, and images — and falls back gracefully. The architecture (fetch-with-strategy pattern in SW) is well-designed.
- The **API routes** (`/api/*`) are clearly separated from page routes, and the JS client calls them via `fetch`. This clean boundary is what makes offline-sync feasible.
- **Branding** is injected per-game via `game.data.branding` and surfaced through a context processor, not hardcoded in templates. This is the right pattern for a multi-client product.
- **`admin_required` decorator** is duplicated in `api/routes.py` and `admin/routes.py`. Should live in a shared `decorators.py`. *(Still open — deferred from Sprint 01.)*

### What Needs Attention

- **Business logic in routes:** Proximity checking, team location assignment (`assign_locations_to_teams`), progress computation (`build_progress_response`), and tile URL generation are all embedded in `api/routes.py`. These belong in a service layer (`app/services/game_service.py`) so they can be tested independently.
- **Cross-blueprint import:** `api_bp` route's `get_game_status_data` is imported into `main/routes.py`. This ties two blueprints together at import time. It should be moved to a shared module.
- **Template logic:** The `findloc` route builds full location dictionaries with conditional `url_for` calls inline. This is manageable now but will become messy as game types diverge. A serializer or `to_dict()` method on the models would be cleaner.
- **In-memory tombstone cache (`cache.py`):** This is a clever short-term solution, but it does not survive a server restart and is not thread-safe under gunicorn multi-worker deployment. Safe for single-worker dev/MVP, but flag it before scaling.

---

## 5. MVP Maturity Assessment

| Area | Status | Notes |
|---|---|---|
| Core game loop (route → clue → find → next) | ✅ Functional | Works in beta |
| Authentication (magic link) | ✅ Functional | Email dep needs monitoring |
| Team + game data model | ✅ Solid | JSON flexibility is good |
| Admin panel (Flask-Admin) | ✅ Functional | Covers all key models |
| Offline shell caching | ✅ Wired | SW caches app shell + tiles |
| Branding / per-game theming | ✅ Working | Via `game.data.branding` |
| Camera / selfie validation | ⚠️ Beta feedback | Awkward UX, see below |
| GPS proximity validation | ⚠️ Partial | Code exists, not fully active in live flow |
| QR / image verification | ⚠️ Gated off | Feature flags in template, not yet live |
| Offline game progress sync | ⚠️ In-progress | JS modules exist, backend sync not complete |
| Map-based game mode | ✅ Functional | `map_hunt` dispatch active, `/map` route and `map/play.html` working |
| Production config (HTTPS, secure cookies) | ✅ Fixed | Sprint 01 — `v1.0.1-security` |
| Error handling / 403/404 pages | ⚠️ Minimal | Flask defaults in use |
| Test coverage | ✅ Expanded | 39 tests passing, including Sprint 02 map-mode coverage |

**MVP verdict:** The app is functional and deployable for controlled events. The core game loop — team joins a game, receives an ordered route of locations, marks them found — works end to end. Security config gaps from the initial review have been closed in Sprint 01 (`v1.0.1-security`), and Sprint 02 has now activated the map-hunt mode as a second playable experience. The remaining open items are camera UX polish and the longer-horizon offline/sync features.

---

## 6. Beta Feedback: Camera Interface

The reported awkwardness with the camera is consistent with what's in the code. The `validate-selfie.js` and `camera.js` modules are present and wired to the selfie validation flow, but:

- Mobile browsers vary significantly in how they handle `getUserMedia` constraints — particularly the `facingMode: 'environment'` constraint on iOS.
- The selfie flow requires the user to preview, capture, and confirm in sequence, which adds friction during an event when people are moving.

**Short-term recommendations:**
- Provide a "skip photo" or "admin confirm" fallback so a location can be marked found without blocking on camera issues.
- Test explicitly on iOS Safari — this is where most friction originates in PWAs.
- Consider replacing the in-app camera capture with a native file input as fallback (`<input type="file" accept="image/*" capture="environment">`), which delegates to the OS camera app and is far more reliable.

---

## 7. Follow-Up Backlog

The March 30 review originally included detailed sprint ideas and immediate next-beta recommendations.

Those items now live in [docs/backlog.md](backlog.md) so this file can stay focused on the actual review.

In short:

- Sprint A / Sprint B ideas from the original review became the implemented Sprint 02 / Sprint 03 workstreams
- remaining follow-up items such as camera fallback, `teams/routes.py` cleanup, and future experience types are tracked in the backlog

---

*End of review.*
