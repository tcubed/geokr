import io
import uuid

from PIL import Image

from app.models import Game, GameType, Team, db


def _unique_name(prefix='game'):
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _get_or_create_gametype(name):
    gametype = GameType.query.filter_by(name=name).first()
    if not gametype:
        gametype = GameType(name=name)
        db.session.add(gametype)
        db.session.commit()
    return gametype


def _create_game(name=None, gametype_name='findloc', status=None):
    game = Game(
        name=name or _unique_name(),
        discoverable='public',
        mode='open',
        gametype=_get_or_create_gametype(gametype_name),
        data={'branding': {'navbar_color': '#0d6efd'}},
    )
    if status:
        game.set_admin_status(status)
    db.session.add(game)
    db.session.commit()
    return game


def _make_test_image():
    image = Image.new('RGB', (32, 32), color='#336699')
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    buffer.seek(0)
    return buffer


def _login_existing_user(client, email='admin@test.com', display_name='Admin User'):
    return client.post(
        '/register_or_login',
        data={'email': email, 'display_name': display_name},
        follow_redirects=False,
    )


def test_game_admin_page_shows_new_game_edit_action_and_status(app, client):
    with app.app_context():
        game = _create_game(status='ongoing')
        game_name = game.name

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.get('/game_admin')
    assert response.status_code == 200
    assert b'New Game' in response.data
    assert b'Edit game' in response.data
    assert game_name.encode() in response.data
    assert b'ongoing' in response.data

    client.get('/logout', follow_redirects=False)


def test_game_admin_new_and_edit_routes_are_admin_only(app, client):
    with app.app_context():
        game = _create_game()
        game_id = game.id

    login_response = _login_existing_user(client, email='user@test.com', display_name='Test User')
    assert login_response.status_code in (301, 302)

    new_response = client.get('/game_admin/new', follow_redirects=False)
    edit_response = client.get(f'/game_admin/{game_id}/edit', follow_redirects=False)

    assert new_response.status_code in (301, 302)
    assert edit_response.status_code in (301, 302)

    client.get('/logout', follow_redirects=False)


def test_game_admin_create_game_persists_requested_fields(app, client):
    game_name = _unique_name('created-game')

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.post(
        '/game_admin/new',
        data={
            'name': game_name,
            'description': 'Created from test',
            'discoverable': 'no',
            'mode': 'competitive',
            'status': 'ready',
            'gametype': 'findloc',
            'navbar_color': '#123456',
            'navbar_color_hex': '#123456',
            'brand_icon_alt': 'Test brand icon',
        },
        follow_redirects=True,
    )

    assert response.status_code == 200
    assert b'Save Changes' in response.data
    assert game_name.encode() in response.data

    with app.app_context():
        game = Game.query.filter_by(name=game_name).first()
        assert game is not None
        assert game.discoverable == 'no'
        assert game.mode == 'competitive'
        assert game.gametype.name == 'findloc'
        assert game.get_admin_status() == 'ready'
        assert game.data['branding']['navbar_color'] == '#123456'
        assert game.data['branding']['icon_alt'] == 'Test brand icon'

    client.get('/logout', follow_redirects=False)


def test_game_admin_edit_game_updates_branding_upload(app, client, tmp_path):
    with app.app_context():
        app.config['UPLOAD_FOLDER'] = str(tmp_path)
        game = _create_game(gametype_name='map_hunt')
        game_id = game.id

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.post(
        f'/game_admin/{game_id}/edit',
        data={
            'name': 'Updated Game Name',
            'description': 'Updated description',
            'discoverable': 'public',
            'mode': 'open',
            'status': 'complete',
            'gametype': 'map_hunt',
            'navbar_color': '#abcdef',
            'navbar_color_hex': '#abcdef',
            'brand_icon_alt': 'Updated brand icon',
            'branding_image': (_make_test_image(), 'brand.png'),
        },
        content_type='multipart/form-data',
        follow_redirects=True,
    )

    assert response.status_code == 200
    assert b'Updated Game Name' in response.data

    with app.app_context():
        game = Game.query.get(game_id)
        assert game.name == 'Updated Game Name'
        assert game.description == 'Updated description'
        assert game.get_admin_status() == 'complete'
        assert game.data['branding']['navbar_color'] == '#abcdef'
        assert game.data['branding']['icon_alt'] == 'Updated brand icon'
        assert game.data['branding']['icon_url'].startswith('images/uploads/game-branding/')

    client.get('/logout', follow_redirects=False)


def test_game_admin_actions_update_status(app, client):
    with app.app_context():
        game = _create_game(status=None)
        team = Team(name=_unique_name('team'), game_id=game.id)
        db.session.add(team)
        db.session.commit()
        game_id = game.id

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    start_response = client.post(f'/api/game/{game_id}/start_game')
    assert start_response.status_code == 200
    assert start_response.get_json()['status'] == 'ongoing'

    reset_response = client.post(f'/api/game/{game_id}/reset_locations')
    assert reset_response.status_code == 200
    assert reset_response.get_json()['status'] == 'ready'

    clear_response = client.post(f'/api/game/{game_id}/clear_assignments')
    assert clear_response.status_code == 200
    assert clear_response.get_json()['status'] == 'ready'

    game_admin_response = client.get('/game_admin')
    assert game_admin_response.status_code == 200
    assert b'ready' in game_admin_response.data

    client.get('/logout', follow_redirects=False)


def test_game_admin_edit_form_maps_legacy_navigation_to_map_hunt(app, client):
    with app.app_context():
        game = _create_game(gametype_name='navigation')
        game_id = game.id

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.get(f'/game_admin/{game_id}/edit')
    assert response.status_code == 200
    assert b'value="map_hunt" selected' in response.data
    assert b'Map Hunt' in response.data
    assert b'value="navigation"' not in response.data

    client.get('/logout', follow_redirects=False)
