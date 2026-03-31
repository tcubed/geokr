# Sprint 01 — Security Hardening

**Goal:** Establish a clean, stable v1.0 reference point and close the security gaps identified in the March 30 review before any further feature work.

**Scope:** Config hardening, credential cleanup, legacy auth removal, `.env.example`. No route reorganization. No UI changes.

---

## Phase 0 — Tag v1.0 (pre-sprint snapshot)

Tag the current state of the repo as the "last known working" reference, even though there are uncommitted changes. This gives a rollback point that matches the first successful beta.

```bash
git tag v1.0
git push origin v1.0       # if using a remote
```

After the sprint is complete, commit and tag the result as `v1.0.1-security`.

**Version in app:** `VERSION = 1` in `config.py` is sufficient for now. No user-facing display needed at this stage.

---

## Phase 1 — Create `.env.example`

Create `.env.example` at the repo root documenting all required environment variables. The actual `.env` is already in `.gitignore`; this file is committed as documentation for future deployments or a second developer.

**File:** `.env.example`

```ini
# Flask
SECRET_KEY=change-me-to-a-long-random-string

# Mail (magic link login)
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_DEFAULT_SENDER=your-email@gmail.com

# Database (leave unset to use SQLite default in dev)
# DATABASE_URL=postgresql://user:pass@host/dbname
```

---

## Phase 2 — Remove Hardcoded `secret_key` in `__init__.py`

**File:** `app/__init__.py`

**Problem:** `app.secret_key = 'your-secret-ballroom'` is set after `app.config.from_object(config_class)`, which means it silently overrides the `SECRET_KEY` loaded from `.env` / `config.py`.

**Fix:** Delete that line. `config.py` already reads `SECRET_KEY` from `os.getenv()` via `BaseConfig`. Flask-Admin uses `app.secret_key` via Flask's standard config key, so setting `SECRET_KEY` in config is sufficient.

```python
# DELETE this line:
app.secret_key = 'your-secret-ballroom'  # Needed for Flask-Admin
```

---

## Phase 3 — Fix `ProdConfig` Secure Cookie Settings

**File:** `app/config.py`

**Problem:** `SESSION_COOKIE_SECURE = False` and `REMEMBER_COOKIE_SECURE = False` are set in `BaseConfig` and not overridden in `ProdConfig`. When deployed to HTTPS, session cookies can be sent over plain HTTP, exposing session tokens.

**Fix:** Override both in `ProdConfig` to `True`.

```python
class ProdConfig(BaseConfig):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///prod.db')
    SESSION_COOKIE_SECURE = True
    REMEMBER_COOKIE_SECURE = True
```

---

## Phase 4 — Remove Hardcoded Basic Auth Stub; Re-protect with `@admin_required`

**File:** `app/admin/routes.py`

**Problem:** `check_auth()` / `authenticate()` / `@requires_auth` use hardcoded credentials (`admin` / `secret`). Several routes currently use `@requires_auth`.

**Fix:** Delete the three Basic Auth functions and the `@requires_auth` decorator. Replace all `@requires_auth` usages on the dev/admin routes with `@admin_required` (already defined in the same file and uses Flask-Login + role check).

Routes to re-protect with `@admin_required`:
- `/load_sample_data`
- `/clear`
- `/games` (admin page)
- `/teams` (admin page)
- `/characters` (admin page)
- `/api/games` (currently completely unprotected — add `@admin_required`)
- `/api/teams`
- `/api/characters`
- `/api/characters/<id>`

Functions to delete:
```python
def check_auth(username, password): ...
def authenticate(): ...
def requires_auth(f): ...
```

---

## Phase 5 — Remove Legacy Password Auth Code

**File:** `app/main/auth.py`

**Problem:** The large commented-out block at the bottom of the file contains the old password-based `register_legacy` and `login_legacy` routes including `generate_password_hash` / `check_password_hash`. Also `login_leg2` is commented out. Dead code adds noise and could create confusion about what the actual auth flow is.

**Fix:** Delete the entire `# LEGACY` section comment block at the bottom of `auth.py`. This includes:
- Commented-out `register_legacy` route
- Commented-out `login_legacy` route
- Commented-out `login_leg2` route

The `password_hash` column on the `User` model is left as-is (no migration needed — it's effectively nullable dead weight and removing it requires a migration with no functional benefit right now).

Also clean up the dead code after the `return` in `magic_login()` — the `generate_resume_token` / `render_template` block after the `return redirect(...)` is unreachable:

```python
# DELETE these unreachable lines at end of magic_login():
    resume_token = generate_resume_token(user.email)
    return render_template("user/magic_success.html",
                           resume_token=resume_token,
                           display_name=user.display_name)
```

---

## Phase 6 — Add Tests

Create a `tests/` directory with a minimal test suite covering the security changes made in this sprint. The goal is not full coverage — it's a regression harness so future changes don't accidentally reintroduce these issues.

**Framework:** `pytest` + `Flask` test client (no extra dependencies beyond what's already installed).

**File structure:**
```
tests/
    conftest.py          # app fixture, test DB setup
    test_config.py       # config / secret key checks
    test_auth.py         # magic link flow, logout
    test_admin_access.py # admin route protection
```

### `conftest.py`
- Create a `test_app` fixture using `ProdConfig`-derived test config (in-memory SQLite, `TESTING=True`, `WTF_CSRF_ENABLED=False`)
- Create fixtures for: anonymous client, logged-in regular user client, logged-in admin client
- Seed the minimum required DB records (User, Role, UserRole) in the fixture

### `test_config.py`
- `SECRET_KEY` is not the old hardcoded value (`'your-secret-ballroom'`)
- `ProdConfig.SESSION_COOKIE_SECURE` is `True`
- `ProdConfig.REMEMBER_COOKIE_SECURE` is `True`
- `DevConfig.SESSION_COOKIE_SECURE` is `False` (expected for local dev)

### `test_auth.py`
- Anonymous user hitting `/findloc` redirects to login
- `POST /login` with unknown email returns failure message
- `GET /magic-login` with expired/bad token returns error and redirects
- `GET /magic-login` with valid token logs user in and redirects to `/findloc`
- `GET /logout` logs out authenticated user

### `test_admin_access.py`
- Anonymous user hitting an `@admin_required` route gets 401 or redirect to login
- Regular user (non-admin) hitting an `@admin_required` route gets 403
- Admin user can access `@admin_required` routes
- Verify `check_auth` / `requires_auth` / Basic Auth functions no longer exist in `admin/routes.py`
- `/admin/` (Flask-Admin panel) redirects anonymous users to login

---

## Phase 7 — Commit and Tag `v1.0.1-security`

```bash
git add -A
git commit -m "security: harden config, remove legacy auth and basic auth stub; add test suite"
git tag v1.0.1-security
git push origin v1.0.1-security   # if using remote
```

---

## Checklist

- [ ] Phase 0 — Tag `v1.0`
- [ ] Phase 1 — Create `.env.example`
- [ ] Phase 2 — Remove hardcoded `app.secret_key` from `__init__.py`
- [ ] Phase 3 — Add `SESSION_COOKIE_SECURE` / `REMEMBER_COOKIE_SECURE = True` to `ProdConfig`
- [ ] Phase 4 — Delete basic auth functions; re-protect dev routes with `@admin_required`
- [ ] Phase 5 — Delete legacy password auth commented code in `auth.py`; remove unreachable code in `magic_login()`
- [ ] Phase 6 — Add tests (`tests/`, conftest, config/auth/admin coverage)
- [ ] Phase 7 — Commit and tag `v1.0.1-security`

---

## Out of Scope (Deferred)

- Route reorganization (`main/routes.py` split)
- Camera UX improvements
- `password_hash` column migration
- `teams/routes.py` stub implementation
- `VERSION` display in UI
