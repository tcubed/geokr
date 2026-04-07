import uuid

from app import db
from app.models import Game, GameType, Location


def _unique_name(prefix='game'):
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _get_or_create_gametype(name='findloc'):
    gametype = GameType.query.filter_by(name=name).first()
    if not gametype:
        gametype = GameType(name=name)
        db.session.add(gametype)
        db.session.commit()
    return gametype


def _create_game(name=None, gametype_name='findloc', routes=None):
    game = Game(
        name=name or _unique_name(),
        discoverable='public',
        mode='open',
        gametype=_get_or_create_gametype(gametype_name),
        data={'branding': {'navbar_color': '#0d6efd'}, 'routes': routes or []},
    )
    db.session.add(game)
    db.session.commit()
    return game


def _add_location(game_id, name, lat=44.0, lon=-88.0):
    location = Location(
        game_id=game_id,
        name=name,
        latitude=lat,
        longitude=lon,
        clue_text=f'Clue for {name}',
    )
    db.session.add(location)
    db.session.commit()
    return location


def _login_existing_user(client, email='admin@test.com', display_name='Admin User'):
    return client.post(
        '/register_or_login',
        data={'email': email, 'display_name': display_name},
        follow_redirects=False,
    )


def test_game_edit_page_shows_manage_routes_link_for_existing_game(app, client):
    with app.app_context():
        game = _create_game(name='Managed Routes Game')
        game_id = game.id

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.get(f'/game_admin/{game_id}/edit')
    assert response.status_code == 200
    assert f'/game_admin/{game_id}/routes'.encode() in response.data
    assert b'Manage Routes' in response.data

    client.get('/logout', follow_redirects=False)


def test_new_game_page_does_not_show_manage_routes_link(client):
    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.get('/game_admin/new')
    assert response.status_code == 200
    assert b'/routes' not in response.data

    client.get('/logout', follow_redirects=False)


def test_game_scoped_routes_route_is_admin_only(app, client):
    with app.app_context():
        game = _create_game()
        game_id = game.id

    login_response = _login_existing_user(client, email='user@test.com', display_name='Test User')
    assert login_response.status_code in (301, 302)

    response = client.get(f'/game_admin/{game_id}/routes', follow_redirects=False)
    assert response.status_code in (301, 302)

    client.get('/logout', follow_redirects=False)


def test_game_scoped_routes_page_hides_picker_and_binds_game(app, client):
    with app.app_context():
        game = _create_game(name='Bound Routes Game')
        game_id = game.id

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.get(f'/game_admin/{game_id}/routes')
    assert response.status_code == 200
    assert b'Manage Routes - Bound Routes Game' in response.data
    assert b'Select Game:' not in response.data
    assert f'data-game-id="{game_id}"'.encode() in response.data
    assert f'/game_admin/{game_id}/edit'.encode() in response.data
    assert b'No separate game selection is required.' in response.data

    client.get('/logout', follow_redirects=False)


def test_legacy_routes_page_remains_available_as_picker(app, client):
    with app.app_context():
        _create_game(name='Legacy Routes Picker Game')

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.get('/admin/game_routes')
    assert response.status_code == 200
    assert b'Select Game:' in response.data
    assert b'Legacy Routes Picker Game' in response.data
    assert b'id="gameSelect"' in response.data

    client.get('/logout', follow_redirects=False)


def test_route_api_crud_flow_updates_only_target_game(app, client):
    with app.app_context():
        game = _create_game(name='Route Target Game', routes=[])
        other_game = _create_game(name='Route Other Game', routes=[[999]])
        loc1 = _add_location(game.id, 'Alpha', lat=44.1, lon=-88.1)
        loc2 = _add_location(game.id, 'Beta', lat=44.2, lon=-88.2)
        game_id = game.id
        other_game_id = other_game.id
        loc1_id = loc1.id
        loc2_id = loc2.id

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    add_response = client.post(f'/api/game/{game_id}/routes', json={'route': [loc1_id]})
    assert add_response.status_code == 200
    assert add_response.get_json()['route'] == [loc1_id]

    update_response = client.put(f'/api/game/{game_id}/route/0', json={'route': [loc1_id, loc2_id]})
    assert update_response.status_code == 200
    assert update_response.get_json()['route'] == [loc1_id, loc2_id]

    save_all_response = client.post(f'/api/game/{game_id}/routes/all', json={'routes': [[loc2_id], [loc1_id, loc2_id]]})
    assert save_all_response.status_code == 200
    assert save_all_response.get_json()['routes'] == [[loc2_id], [loc1_id, loc2_id]]

    delete_response = client.delete(f'/api/game/{game_id}/route/0')
    assert delete_response.status_code == 200

    fetch_response = client.get(f'/api/game/{game_id}/routes')
    assert fetch_response.status_code == 200
    assert fetch_response.get_json()['routes'] == [[loc1_id, loc2_id]]

    other_fetch_response = client.get(f'/api/game/{other_game_id}/routes')
    assert other_fetch_response.status_code == 200
    assert other_fetch_response.get_json()['routes'] == [[999]]

    client.get('/logout', follow_redirects=False)