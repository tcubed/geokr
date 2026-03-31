"""
Tests for the magic-link authentication flow.
"""


def test_login_page_loads(client):
    rv = client.get('/login')
    assert rv.status_code == 200


def test_register_or_login_page_loads(client):
    rv = client.get('/register_or_login')
    assert rv.status_code == 200


def test_unauthenticated_findloc_redirects_to_login(client):
    rv = client.get('/findloc', follow_redirects=False)
    assert rv.status_code in (301, 302)
    assert 'login' in rv.location or 'register' in rv.location


def test_login_unknown_email_rejected(client):
    rv = client.post(
        '/login',
        data={'email': 'nobody@nowhere.invalid'},
        follow_redirects=True,
    )
    assert rv.status_code == 200
    body = rv.data.lower()
    assert b'not found' in body or b'email not found' in body


def test_magic_login_missing_token(client):
    rv = client.get('/magic-login', follow_redirects=True)
    assert rv.status_code == 200
    body = rv.data.lower()
    assert b'missing' in body or b'token' in body


def test_magic_login_bad_token(client):
    rv = client.get('/magic-login?token=completely-invalid', follow_redirects=True)
    assert rv.status_code == 200
    body = rv.data.lower()
    assert b'invalid' in body or b'expired' in body


def test_magic_login_valid_token_redirects_to_findloc(app, client):
    from app.main.auth import generate_magic_token
    with app.app_context():
        token = generate_magic_token('user@test.com')
    rv = client.get(f'/magic-login?token={token}', follow_redirects=False)
    # Should redirect (login succeeded) — exact destination may vary by team state
    assert rv.status_code in (301, 302)
    assert 'findloc' in rv.location


def test_logout_redirects_to_login(user_client):
    rv = user_client.get('/logout', follow_redirects=False)
    assert rv.status_code in (301, 302)
    assert 'login' in rv.location or 'register' in rv.location
