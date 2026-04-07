import uuid

from app import db
from app.models import Game, GameType, Location, Team, TeamLocationAssignment, TeamMembership


def _unique_name(prefix='qr-game'):
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _get_or_create_gametype(name='findloc'):
    gametype = GameType.query.filter_by(name=name).first()
    if not gametype:
        gametype = GameType(name=name)
        db.session.add(gametype)
        db.session.commit()
    return gametype


def _create_qr_game(name=None, *, qr_enabled=True, location_count=2):
    game = Game(
        name=name or _unique_name(),
        discoverable='public',
        mode='open',
        gametype=_get_or_create_gametype('findloc'),
        data={'branding': {'navbar_color': '#0d6efd'}},
    )
    game.set_qr_enabled(qr_enabled)
    db.session.add(game)
    db.session.flush()

    locations = []
    for index in range(location_count):
        location = Location(
            game_id=game.id,
            name=f'QR Location {index + 1}',
            latitude=44.0 + index,
            longitude=-88.0 - index,
            clue_text=f'Clue {index + 1}',
        )
        db.session.add(location)
        db.session.flush()
        locations.append(location)

    game.ensure_qr_tokens([location.id for location in locations], token_factory=lambda: f'token-{uuid.uuid4().hex[:10]}')
    db.session.add(game)
    db.session.commit()
    return game.id, [location.id for location in locations]


def _create_qr_team(user_id, *, qr_enabled=True, location_count=2):
    game_id, location_ids = _create_qr_game(qr_enabled=qr_enabled, location_count=location_count)

    team = Team(name=_unique_name('qr-team'), game_id=game_id)
    db.session.add(team)
    db.session.flush()

    db.session.add(TeamMembership(user_id=user_id, team_id=team.id, role='captain'))
    for index, location_id in enumerate(location_ids):
        db.session.add(
            TeamLocationAssignment(
                team_id=team.id,
                location_id=location_id,
                game_id=game_id,
                order_index=index,
                found=False,
            )
        )

    db.session.commit()
    return {'game_id': game_id, 'team_id': team.id, 'location_ids': location_ids}


def _login_existing_user(client, email='admin@test.com', display_name='Admin User'):
    return client.post(
        '/register_or_login',
        data={'email': email, 'display_name': display_name},
        follow_redirects=False,
    )


def test_game_admin_edit_persists_enable_qr(app, client):
    with app.app_context():
        game_id, _location_ids = _create_qr_game(qr_enabled=False, location_count=1)

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.post(
        f'/game_admin/{game_id}/edit',
        data={
            'name': 'QR Enabled Game',
            'description': 'Has QR enabled',
            'discoverable': 'public',
            'mode': 'open',
            'status': 'ready',
            'gametype': 'findloc',
            'enable_qr': '1',
            'navbar_color': '#123456',
            'navbar_color_hex': '#123456',
            'brand_icon_alt': 'QR Enabled',
        },
        follow_redirects=True,
    )

    assert response.status_code == 200
    body = response.data.decode('utf-8')
    assert 'id="enable_qr"' in body
    assert 'checked' in body.split('id="enable_qr"', 1)[1].split('>', 1)[0]

    with app.app_context():
        game = Game.query.get(game_id)
        assert game.qr_enabled is True

    client.get('/logout', follow_redirects=False)


def test_manage_locations_page_shows_print_qr_button_when_enabled(app, client):
    with app.app_context():
        game_id, _location_ids = _create_qr_game(qr_enabled=True, location_count=1)

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.get(f'/game_admin/{game_id}/locations')
    assert response.status_code == 200
    assert b'Print QR Codes' in response.data
    assert f'/game_admin/{game_id}/qr_labels'.encode() in response.data

    client.get('/logout', follow_redirects=False)


def test_qr_labels_page_is_admin_only_and_contains_labels(app, client):
    with app.app_context():
        game_id, _location_ids = _create_qr_game(qr_enabled=True, location_count=2)

    login_response = _login_existing_user(client, email='user@test.com', display_name='Test User')
    assert login_response.status_code in (301, 302)
    forbidden_response = client.get(f'/game_admin/{game_id}/qr_labels', follow_redirects=False)
    assert forbidden_response.status_code in (301, 302)
    client.get('/logout', follow_redirects=False)

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)
    response = client.get(f'/game_admin/{game_id}/qr_labels')
    assert response.status_code == 200
    assert b'QR Labels' in response.data
    assert b'QR Location 1' in response.data
    assert b'QR Location 2' in response.data
    assert b'data:image/png;base64,' in response.data

    client.get('/logout', follow_redirects=False)


def test_findloc_page_shows_scan_qr_when_game_qr_enabled(app, client, regular_user_id):
    with app.app_context():
        state = _create_qr_team(regular_user_id, qr_enabled=True, location_count=1)

    login_response = _login_existing_user(client, email='user@test.com', display_name='Test User')
    assert login_response.status_code in (301, 302)

    with client.session_transaction() as sess:
        sess['active_team_id'] = state['team_id']

    response = client.get('/findloc')
    assert response.status_code == 200
    assert b'"enable_qr_scanner": true' in response.data
    assert b'Scan QR' in response.data
    assert b'Take Selfie' in response.data

    client.get('/logout', follow_redirects=False)


def test_qr_validation_accepts_matching_token_for_current_clue(app, client, regular_user_id):
    with app.app_context():
        state = _create_qr_team(regular_user_id, qr_enabled=True, location_count=2)
        game = Game.query.get(state['game_id'])
        first_location_id = state['location_ids'][0]
        qr_token = game.get_qr_token(first_location_id)

    login_response = _login_existing_user(client, email='user@test.com', display_name='Test User')
    assert login_response.status_code in (301, 302)

    response = client.post(
        f'/api/location/{first_location_id}/found',
        json={
            'game_id': state['game_id'],
            'method': 'qr',
            'metadata': {'qrToken': f'geokr:qr:{qr_token}'},
        },
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['method'] == 'qr'
    assert payload['location_id'] == first_location_id
    assert payload['team_progress']['found'] == 1

    client.get('/logout', follow_redirects=False)


def test_qr_validation_rejects_wrong_or_future_clue_token(app, client, regular_user_id):
    with app.app_context():
        state = _create_qr_team(regular_user_id, qr_enabled=True, location_count=2)
        game = Game.query.get(state['game_id'])
        first_location_id, second_location_id = state['location_ids']
        second_token = game.get_qr_token(second_location_id)

    login_response = _login_existing_user(client, email='user@test.com', display_name='Test User')
    assert login_response.status_code in (301, 302)

    response = client.post(
        f'/api/location/{first_location_id}/found',
        json={
            'game_id': state['game_id'],
            'method': 'qr',
            'metadata': {'qrToken': f'geokr:qr:{second_token}'},
        },
    )

    assert response.status_code == 403
    payload = response.get_json()
    assert payload['success'] is False

    client.get('/logout', follow_redirects=False)
