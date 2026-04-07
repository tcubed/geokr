import uuid

from app import db
from app.models import Game, GameType


def _unique_name(prefix='game'):
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _get_or_create_gametype(name='findloc'):
    gametype = GameType.query.filter_by(name=name).first()
    if not gametype:
        gametype = GameType(name=name)
        db.session.add(gametype)
        db.session.commit()
    return gametype


def _create_game(name=None, gametype_name='findloc'):
    game = Game(
        name=name or _unique_name(),
        discoverable='public',
        mode='open',
        gametype=_get_or_create_gametype(gametype_name),
        data={'branding': {'navbar_color': '#0d6efd'}},
    )
    db.session.add(game)
    db.session.commit()
    return game


def _login_existing_user(client, email='admin@test.com', display_name='Admin User'):
    return client.post(
        '/register_or_login',
        data={'email': email, 'display_name': display_name},
        follow_redirects=False,
    )


def test_game_edit_page_shows_manage_locations_link_for_existing_game(app, client):
    with app.app_context():
        game = _create_game(name='Managed Locations Game')
        game_id = game.id

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.get(f'/game_admin/{game_id}/edit')
    assert response.status_code == 200
    assert f'/game_admin/{game_id}/locations'.encode() in response.data
    assert b'Manage Locations' in response.data

    client.get('/logout', follow_redirects=False)


def test_new_game_page_does_not_show_manage_locations_link(client):
    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.get('/game_admin/new')
    assert response.status_code == 200
    assert b'/locations' not in response.data

    client.get('/logout', follow_redirects=False)


def test_game_scoped_locations_route_is_admin_only(app, client):
    with app.app_context():
        game = _create_game()
        game_id = game.id

    login_response = _login_existing_user(client, email='user@test.com', display_name='Test User')
    assert login_response.status_code in (301, 302)

    response = client.get(f'/game_admin/{game_id}/locations', follow_redirects=False)
    assert response.status_code in (301, 302)

    client.get('/logout', follow_redirects=False)


def test_game_scoped_locations_page_hides_picker_and_binds_game(app, client):
    with app.app_context():
        game = _create_game(name='Bound Game')
        game_id = game.id

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.get(f'/game_admin/{game_id}/locations')
    assert response.status_code == 200
    assert b'Manage Locations - Bound Game' in response.data
    assert b'Select a game:' not in response.data
    assert f'data-game-id="{game_id}"'.encode() in response.data
    assert f'/game_admin/{game_id}/edit'.encode() in response.data
    assert b'No separate game selection is required.' in response.data

    client.get('/logout', follow_redirects=False)


def test_legacy_locations_page_remains_available_as_picker(app, client):
    with app.app_context():
        _create_game(name='Legacy Picker Game')

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.get('/admin/game_locations')
    assert response.status_code == 200
    assert b'Select a game:' in response.data
    assert b'Legacy Picker Game' in response.data
    assert b'id="gameSelect"' in response.data

    client.get('/logout', follow_redirects=False)