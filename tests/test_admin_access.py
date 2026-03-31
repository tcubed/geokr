"""
Tests for Sprint 01 admin access control changes.

Verifies:
  - Basic-auth stub functions are gone
  - All formerly @requires_auth routes now enforce @admin_required
  - Flask-Admin panel blocks anonymous access
"""


# ---------------------------------------------------------------------------
# Structural — confirm old credential-based auth was removed
# ---------------------------------------------------------------------------

def test_check_auth_removed():
    import app.admin.routes as m
    assert not hasattr(m, 'check_auth'), \
        "check_auth (hardcoded admin/secret) must be removed"


def test_authenticate_removed():
    import app.admin.routes as m
    assert not hasattr(m, 'authenticate'), \
        "authenticate() basic-auth helper must be removed"


def test_requires_auth_removed():
    import app.admin.routes as m
    assert not hasattr(m, 'requires_auth'), \
        "requires_auth decorator must be removed"


# ---------------------------------------------------------------------------
# /load_sample_data
# ---------------------------------------------------------------------------

def test_anon_load_sample_data_redirects(client):
    rv = client.get('/admin/load_sample_data', follow_redirects=False)
    assert rv.status_code in (301, 302)


def test_user_load_sample_data_forbidden(user_client):
    rv = user_client.get('/admin/load_sample_data')
    assert rv.status_code in (302, 403)


def test_admin_load_sample_data_allowed(admin_client):
    rv = admin_client.get('/admin/load_sample_data')
    assert rv.status_code not in (401, 403)


# ---------------------------------------------------------------------------
# /api/games (was completely unprotected before this sprint)
# ---------------------------------------------------------------------------

def test_anon_api_games_redirects(client):
    rv = client.get('/admin/api/games', follow_redirects=False)
    assert rv.status_code in (301, 302)


def test_user_api_games_forbidden(user_client):
    rv = user_client.get('/admin/api/games')
    assert rv.status_code in (302, 403)


def test_admin_api_games_allowed(admin_client):
    rv = admin_client.get('/admin/api/games')
    assert rv.status_code not in (401, 403)


# ---------------------------------------------------------------------------
# /clear
# ---------------------------------------------------------------------------

def test_anon_clear_redirects(client):
    rv = client.get('/admin/clear', follow_redirects=False)
    assert rv.status_code in (301, 302)


def test_user_clear_forbidden(user_client):
    rv = user_client.get('/admin/clear')
    assert rv.status_code in (302, 403)


# ---------------------------------------------------------------------------
# Flask-Admin model views (index doesn't gate, but model views do)
# ---------------------------------------------------------------------------

def test_flask_admin_model_view_blocks_anonymous(client):
    """Flask-Admin model views use is_accessible() which checks is_admin.
    The index (/) is public; individual model views redirect when not accessible."""
    rv = client.get('/admin/user/', follow_redirects=False)
    assert rv.status_code in (301, 302), \
        "Anonymous access to Flask-Admin model views should redirect"
