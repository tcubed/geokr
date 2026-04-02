from datetime import datetime

from app import db as _db
from app.models import Game, GameType, Location, Team, TeamLocationAssignment, TeamMembership


def _login_existing_user(client, email, display_name):
    return client.post(
        '/register_or_login',
        data={'email': email, 'display_name': display_name},
        follow_redirects=False,
    )


def _create_sync_game(user_id):
    gametype = GameType.query.filter_by(name='findloc').first()
    if not gametype:
        gametype = GameType(name='findloc')
        _db.session.add(gametype)
        _db.session.flush()

    game = Game(
        name='Offline Sync Test',
        gametype_id=gametype.id,
        description='Offline sync fixture game',
    )
    _db.session.add(game)
    _db.session.flush()

    loc1 = Location(
        game_id=game.id,
        name='Start Marker',
        latitude=44.0,
        longitude=-88.0,
        clue_text='Begin here',
        show_pin=True,
    )
    loc2 = Location(
        game_id=game.id,
        name='Second Marker',
        latitude=44.001,
        longitude=-88.001,
        clue_text='Continue here',
        show_pin=True,
    )
    _db.session.add_all([loc1, loc2])
    _db.session.flush()

    team = Team(name='Sync Team', game_id=game.id)
    _db.session.add(team)
    _db.session.flush()

    _db.session.add(TeamMembership(user_id=user_id, team_id=team.id, role='captain'))
    _db.session.add_all([
        TeamLocationAssignment(
            team_id=team.id,
            location_id=loc1.id,
            game_id=game.id,
            order_index=0,
            found=False,
        ),
        TeamLocationAssignment(
            team_id=team.id,
            location_id=loc2.id,
            game_id=game.id,
            order_index=1,
            found=False,
        ),
    ])
    _db.session.commit()

    return {
        'game_id': game.id,
        'team_id': team.id,
        'location_1_id': loc1.id,
        'location_2_id': loc2.id,
    }


def test_direct_found_sync_allows_missing_lat_lon(app, client, regular_user_id):
    with app.app_context():
        state = _create_sync_game(regular_user_id)

    login_rv = _login_existing_user(client, 'user@test.com', 'Test User')
    assert login_rv.status_code in (301, 302)

    rv = client.post(
        f"/api/location/{state['location_1_id']}/found",
        json={
            'game_id': state['game_id'],
            'team_id': state['team_id'],
            'method': 'direct',
            'client_event_id': 'evt-direct-1',
        },
    )
    assert rv.status_code == 200

    data = rv.get_json()
    assert data['success'] is True
    assert data['location_id'] == state['location_1_id']
    assert data['method'] == 'direct'
    assert data['client_event_id'] == 'evt-direct-1'
    assert data['team_progress']['found'] == 1
    assert data['team_progress']['total'] == 2


def test_found_endpoint_is_idempotent_for_replayed_event(app, client, regular_user_id):
    with app.app_context():
        state = _create_sync_game(regular_user_id)

    login_rv = _login_existing_user(client, 'user@test.com', 'Test User')
    assert login_rv.status_code in (301, 302)

    payload = {
        'game_id': state['game_id'],
        'team_id': state['team_id'],
        'method': 'direct',
        'client_event_id': 'evt-repeat-1',
    }
    first = client.post(f"/api/location/{state['location_1_id']}/found", json=payload)
    second = client.post(f"/api/location/{state['location_1_id']}/found", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200

    second_data = second.get_json()
    assert second_data['success'] is True
    assert second_data['team_progress']['found'] == 1
    assert second_data['team_progress']['total'] == 2



def test_game_state_reflects_found_progress_after_sync(app, client, regular_user_id):
    with app.app_context():
        state = _create_sync_game(regular_user_id)

    login_rv = _login_existing_user(client, 'user@test.com', 'Test User')
    assert login_rv.status_code in (301, 302)

    mark_rv = client.post(
        f"/api/location/{state['location_1_id']}/found",
        json={
            'game_id': state['game_id'],
            'team_id': state['team_id'],
            'method': 'direct',
            'client_event_id': 'evt-state-1',
        },
    )
    assert mark_rv.status_code == 200

    state_rv = client.get(f"/api/game/state?game_id={state['game_id']}&team_id={state['team_id']}")
    assert state_rv.status_code == 200

    payload = state_rv.get_json()
    assert payload['current_index'] == 1
    assert payload['locations_found'][0]['location_id'] == state['location_1_id']
    assert payload['locations_found'][0]['found'] is True
    assert payload['locations_found'][1]['location_id'] == state['location_2_id']
    assert payload['locations_found'][1]['found'] is False


def test_geo_found_sync_requires_coordinates(app, client, regular_user_id):
    with app.app_context():
        state = _create_sync_game(regular_user_id)

    login_rv = _login_existing_user(client, 'user@test.com', 'Test User')
    assert login_rv.status_code in (301, 302)

    rv = client.post(
        f"/api/location/{state['location_1_id']}/found",
        json={
            'game_id': state['game_id'],
            'team_id': state['team_id'],
            'method': 'geo',
            'client_event_id': 'evt-geo-missing-1',
        },
    )
    assert rv.status_code == 400

    data = rv.get_json()
    assert data['success'] is False
    assert 'lat/lon' in data['error']


def test_found_sync_rejects_non_member(app, client, regular_user_id):
    with app.app_context():
        state = _create_sync_game(regular_user_id)

    login_rv = _login_existing_user(client, 'admin@test.com', 'Admin User')
    assert login_rv.status_code in (301, 302)

    rv = client.post(
        f"/api/location/{state['location_1_id']}/found",
        json={
            'game_id': state['game_id'],
            'team_id': state['team_id'],
            'method': 'direct',
            'client_event_id': 'evt-non-member-1',
        },
    )
    assert rv.status_code == 403

    data = rv.get_json()
    assert 'not part of a team' in data['error']


def test_replayed_found_sync_is_safe_after_team_completion(app, client, regular_user_id):
    with app.app_context():
        state = _create_sync_game(regular_user_id)
        assignments = TeamLocationAssignment.query.filter_by(team_id=state['team_id']).all()
        for assignment in assignments:
            assignment.found = True
            assignment.timestamp_found = datetime.utcnow()

        team = Team.query.get(state['team_id'])
        team.end_time = datetime.utcnow()
        _db.session.commit()

    login_rv = _login_existing_user(client, 'user@test.com', 'Test User')
    assert login_rv.status_code in (301, 302)

    rv = client.post(
        f"/api/location/{state['location_1_id']}/found",
        json={
            'game_id': state['game_id'],
            'team_id': state['team_id'],
            'method': 'direct',
            'client_event_id': 'evt-complete-1',
        },
    )
    assert rv.status_code == 200

    data = rv.get_json()
    assert data['success'] is True
    assert data['team_progress']['found'] == 2
    assert data['team_progress']['total'] == 2
