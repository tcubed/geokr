# GeoKR App Review — March 30, 2026

**Reviewer:** GitHub Copilot  
**App:** GeoKR / GeoGame — location-based team scavenger hunt  
**Status at review:** Post-beta-1, targeting MVP+  

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

- **`SECRET_KEY` hardcoded in `__init__.py`:** `app.secret_key = 'your-secret-ballroom'` should be removed. The `config.py` already picks it up from `os.getenv("SECRET_KEY")`. The hardcoded value in `create_app()` overrides the safe one.
- **`SESSION_COOKIE_SECURE = False`** in both Dev and Prod configs. This is correct for dev, but `ProdConfig` should set it to `True` and it is not doing so. When deployed to HTTPS, session cookies will be readable over HTTP if this is overlooked.
- **Email dependency as a hard gate:** If `Flask-Mail` misconfigures (bad SMTP creds, email provider blocks, etc.), the user simply cannot log in. There is no fallback. For a beta/event context you may want an admin-bypass mechanism (e.g., a signed URL that skips mail send) for when players are on-site.
- The `serializer` in `auth.py` is instantiated at module import time using `current_app.config['SECRET_KEY']` — this works only because of Flask's application context, but it's subtle. It will silently fail if ever imported outside an app context during testing.
- `/load_sample_data` in `admin/routes.py` uses HTTP Basic Auth with hardcoded credentials (`admin` / `secret`). This should be removed or replaced before any public deployment.

---

## 4. Separation of Concerns

### What's Working

- The **service worker** properly handles three cache domains: app shell, tiles, and images — and falls back gracefully. The architecture (fetch-with-strategy pattern in SW) is well-designed.
- The **API routes** (`/api/*`) are clearly separated from page routes, and the JS client calls them via `fetch`. This clean boundary is what makes offline-sync feasible.
- **Branding** is injected per-game via `game.data.branding` and surfaced through a context processor, not hardcoded in templates. This is the right pattern for a multi-client product.
- **`admin_required` decorator** is duplicated in `api/routes.py` and `admin/routes.py`. Should live in a shared `decorators.py`.

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
| Map-based game mode | 🔲 Stubbed | `/main` route and templates exist, not active |
| Production config (HTTPS, secure cookies) | ⚠️ Needs fix | `SESSION_COOKIE_SECURE` not set for prod |
| Error handling / 403/404 pages | ⚠️ Minimal | Flask defaults in use |
| Test coverage | 🔲 None | No test directory found |

**MVP verdict:** The app is functional and deployable for controlled events. The core game loop — team joins a game, receives an ordered route of locations, marks them found — works end to end. The known gaps (camera UX, prod config hardening) are acceptable for continued beta. The app is at **MVP-ready with low risk** for controlled/invited events, and **not yet ready** for open public deployment due to the security config gaps noted.

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

## 7. Future Sprints — Options for Extended Experiences

These are proposed as bounded sprints, ordered roughly by dependency and value. The goal is to grow from the current "follow one of N routes" mode toward richer experiences with less cellular dependency.

---

### Sprint A: Map-Mode Game Experience

**Goal:** Allow a game type where players are shown a map and must navigate to find a location pin (vs. receiving sequential clue text).

**What exists:** `/main` route, `map.js`, `map/debug.html`, `map/map_prefetch.html`, Leaflet already in service worker cache list.

**What's needed:**
- Activate the `gametype` dispatcher in the index route (currently commented out).
- Build `map/play.html` template using the existing Leaflet integration.
- Add UI to show the target pin (or a radius zone) and trigger "found" on proximity.
- `show_pin` column on `Location` is already in the model — use it to control pin visibility per game.

**Effort estimate:** Medium. The hard parts (Leaflet, geolocation, found-API) are already in place.

---

### Sprint B: Asset Prefetch & Offline-First Play

**Goal:** Let users download all game assets (clues, images, map tiles) before entering a low-connectivity area, then play fully offline with sync on return.

**What exists:** `offline-db.js`, `offline-game.js`, `offline-sync-sw.js`, `/api/tile-list` endpoint, `map_prefetch.html`, SW tile/image caches, `generate_resume_token` for re-auth.

**What's needed:**
- Complete the `/api/game/<id>/offline_bundle` endpoint to package locations + images + team assignments as a single JSON payload.
- Wire `offline-game.js` to consume and write the bundle to IndexedDB.
- Build the sync-on-reconnect flow: accumulate found-events offline, POST them to `/api/location/<id>/found` when network returns.
- Replace in-memory tombstone cache with a persistent equivalent (or scope it correctly to SQLite with a `deleted_at` column).
- Handle conflict: what if two team members both mark a location found while offline?
- **Activate the `magic_success.html` resume-token flow in `magic_login()`.** The template (`user/magic_success.html`) already exists and stores the token in `localStorage`. During Sprint 01 security work, the `render_template` call after `magic_login` was confirmed dead code (a `return redirect` above it was always reached first) and removed. For Sprint B, `magic_login` should be changed to render `magic_success.html` instead of redirecting directly, so the 30-day resume token is written to `localStorage` before the client navigates to `/findloc`. The `generate_resume_token` / `verify_resume_token` helpers in `auth.py` are already in place.

**Effort estimate:** High. The infrastructure is 60% there but the sync protocol needs careful design (idempotency, conflict rules).

---

### Sprint C: Reduce Cellular Data Drain

**Goal:** Lower data usage during active play for groups with limited data plans or rural events.

**Recommendations:**
- Serve Bootstrap / Leaflet / icons from `static/libs/` (already partially present in `static/libs/`) rather than CDN. This is also needed for fully offline caching.
- Compress and resize location images at upload time (PIL is already imported and used in `reshape_images.py`). Set a max dimension (e.g., 800px wide) and quality target (~75% JPEG).
- Use the tile prefetch system (Sprint B) so map tiles are not fetched live during play.
- Add `Cache-Control` headers on static assets for return visits (currently commented out in `add_header()`).
- Gzip responses (Flask-Compress) — one-line addition.

**Effort estimate:** Low–Medium. Mostly configuration and plumbing.

---

### Sprint D: Multiple Experience Types (Client-Configurable)

**Goal:** Enable clients (event organizers) to choose the game experience their group gets — linear route, map hunt, free-roam, QR-scan-only — without code changes.

**What exists:** `GameType` model, `game.data` JSON blob for per-game config, `gametype_id` FK on `Game`, `show_pin` on `Location`, `enable_*` flags in the `findloc` route call.

**What's needed:**
- Define a stable set of experience modes: `route` (current), `map_hunt`, `free_roam`, `qr_only`.
- Store mode in `game.data` or as a new `Game.mode` variant.
- Build a game-editor UI (or extend Flask-Admin) to let organizers configure mode, branding, and routes without SQL.
- Activate `enable_qr_scanner`, `enable_geolocation`, `enable_image_verify` flags based on the selected mode.
- Document the `game.data` JSON schema so organizers (or a future admin UI) know what to set.

**Effort estimate:** Medium–High (mostly the admin-facing game editor).

---

## 8. Immediate Recommendations Before Next Beta

1. **Remove the hardcoded `app.secret_key` in `__init__.py`** — it overrides the env-based config and is a security risk.
2. **Set `SESSION_COOKIE_SECURE = True` in `ProdConfig`** (and ensure deployment runs behind HTTPS).
3. **Add a "skip / admin-confirm" path on the camera step** to unblock players when the camera interface fails.
4. **Delete or complete `teams/routes.py`** — the `join_team` stub is misleading.
5. **Remove the Basic Auth stub** in `admin/routes.py` (`check_auth` with `admin/secret`).
6. **Add a `.env.example`** file documenting required env vars (`SECRET_KEY`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `DATABASE_URL`) — this will save time for any second developer or redeployment.

---

*End of review.*
