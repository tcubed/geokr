import uuid

from app.models import Location

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


def test_locations_api_includes_show_pin_for_manage_locations(app, client):
    with app.app_context():
        game = _create_game(name='Show Pin API Game')
        location = Location(
            game_id=game.id,
            name='Hidden Marker',
            clue_text='No map help here',
            show_pin=False,
        )
        db.session.add(location)
        db.session.commit()
        game_id = game.id

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.get(f'/api/locations?game_id={game_id}')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload[0]['show_pin'] is False

    client.get('/logout', follow_redirects=False)


def test_add_location_defaults_show_pin_true(app, client):
    with app.app_context():
        game = _create_game(name='Default Show Pin Game')
        game_id = game.id

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.post(
        '/api/locations',
        json={
            'game_id': game_id,
            'name': 'Visible Marker',
            'clue_text': 'Pin should show by default',
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['location']['show_pin'] is True

    with app.app_context():
        saved = Location.query.get(payload['location']['id'])
        assert saved.show_pin is True

    client.get('/logout', follow_redirects=False)


def test_locations_api_reports_existing_geofence(app, client):
    with app.app_context():
        game = _create_game(name='Geofence API Game')
        location = Location(
            game_id=game.id,
            name='Fence Marker',
            clue_text='Watch the zone',
        )
        db.session.add(location)
        db.session.flush()
        game.set_location_geofences(location.id, [{
            'id': f'location-{location.id}-enter',
            'enabled': True,
            'shape': 'circle',
            'center': {'lat': 44.1, 'lon': -88.1},
            'radius_m': 50,
            'trigger': 'enter',
            'message': 'Inside zone',
            'repeat_while': 'inside',
            'repeat_every_s': 180,
            'once_per_team': False,
        }])
        db.session.add(game)
        db.session.commit()
        game_id = game.id

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.get(f'/api/locations?game_id={game_id}')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload[0]['has_geofence'] is True

    client.get('/logout', follow_redirects=False)


def test_location_geofence_editor_renders_and_persists(app, client):
    with app.app_context():
        game = _create_game(name='Geofence Editor Game')
        location = Location(
            game_id=game.id,
            name='Story Gate',
            latitude=44.22247,
            longitude=-88.5161,
            clue_text='Find the gate.',
        )
        db.session.add(location)
        db.session.commit()
        game_id = game.id
        location_id = location.id

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    get_response = client.get(f'/game_admin/{game_id}/locations/{location_id}/geofence')
    assert get_response.status_code == 200
    assert b'Edit Geofence' in get_response.data
    assert b'Enter message' in get_response.data
    assert b'Exit message' in get_response.data

    post_response = client.post(
        f'/game_admin/{game_id}/locations/{location_id}/geofence',
        data={
            'enabled': '1',
            'center_lat': '44.22247',
            'center_lon': '-88.5161',
            'radius_m': '90',
            'enter_message': 'You reached the gate.',
            'enter_repeat_every_s': '180',
            'exit_message': 'Return to the gate area.',
            'exit_repeat_every_s': '240',
            'once_per_team': '1',
        },
        follow_redirects=True,
    )
    assert post_response.status_code == 200
    assert b'Geofence settings updated' in post_response.data

    with app.app_context():
        game = Game.query.get(game_id)
        fences = game.get_location_geofences(location_id)
        assert len(fences) == 2
        enter_fence = next(fence for fence in fences if fence['trigger'] == 'enter')
        exit_fence = next(fence for fence in fences if fence['trigger'] == 'exit')
        assert enter_fence['message'] == 'You reached the gate.'
        assert enter_fence['repeat_every_s'] == 180
        assert enter_fence['once_per_team'] is True
        assert exit_fence['message'] == 'Return to the gate area.'
        assert exit_fence['repeat_every_s'] == 240

    client.get('/logout', follow_redirects=False)