"""
Sprint 02 – map_hunt game mode tests.

Covers:
  • GameType seeding in `create_app()`
  • `index()` dispatcher routing by gametype
  • `GET /map` access control and payload
  • `show_pin` field present in rendered location data
"""

import pytest

from app import db as _db
from app.models import (
    Game,
    GameType,
    Location,
    Team,
    TeamLocationAssignment,
    TeamMembership,
)


def _get_or_create_gametype(name):
    gametype = GameType.query.filter_by(name=name).first()
    if not gametype:
        gametype = GameType(name=name)
        _db.session.add(gametype)
        _db.session.flush()
    return gametype


def _create_map_hunt_team(user_id):
    gametype = _get_or_create_gametype('map_hunt')

    game = Game(name='Test Map Hunt', gametype_id=gametype.id)
    _db.session.add(game)
    _db.session.flush()

    location = Location(
        game_id=game.id,
        name='Clue Spot',
        latitude=51.5,
        longitude=-0.1,
        clue_text='Look behind the bench',
        show_pin=True,
    )
    _db.session.add(location)
    _db.session.flush()

    team = Team(name='Map Hunt Testers', game_id=game.id)
    _db.session.add(team)
    _db.session.flush()

    _db.session.add(TeamMembership(user_id=user_id, team_id=team.id, role='captain'))
    _db.session.add(
        TeamLocationAssignment(
            team_id=team.id,
            location_id=location.id,
            game_id=game.id,
            order_index=0,
            found=False,
        )
    )
    _db.session.commit()
    team_id = team.id
    game_id = game.id
    loc_id = location.id
    _db.session.remove()
    return {'team_id': team_id, 'game_id': game_id, 'loc_id': loc_id, 'user_id': user_id}


def _create_map_hunt_team_without_assignments(user_id):
    gametype = _get_or_create_gametype('map_hunt')

    game = Game(name='Legacy Map Hunt', gametype_id=gametype.id)
    _db.session.add(game)
    _db.session.flush()

    location = Location(
        game_id=game.id,
        name='Legacy Clue Spot',
        latitude=40.7128,
        longitude=-74.0060,
        clue_text='Legacy location with no assignments yet',
        show_pin=None,
    )
    _db.session.add(location)
    _db.session.flush()

    team = Team(name='Legacy Map Team', game_id=game.id)
    _db.session.add(team)
    _db.session.flush()

    _db.session.add(TeamMembership(user_id=user_id, team_id=team.id, role='captain'))
    _db.session.commit()
    team_id = team.id
    game_id = game.id
    loc_id = location.id
    _db.session.remove()
    return {'team_id': team_id, 'game_id': game_id, 'loc_id': loc_id, 'user_id': user_id}


def _create_findloc_team(user_id):
    gametype = _get_or_create_gametype('findloc')

    game = Game(name='Test Find Loc', gametype_id=gametype.id)
    _db.session.add(game)
    _db.session.flush()

    team = Team(name='Findloc Testers', game_id=game.id)
    _db.session.add(team)
    _db.session.flush()

    _db.session.add(TeamMembership(user_id=user_id, team_id=team.id, role='captain'))
    _db.session.commit()
    team_id = team.id
    game_id = game.id
    _db.session.remove()
    return {'team_id': team_id, 'game_id': game_id, 'user_id': user_id}


@pytest.fixture
def map_hunt_client(app, client, regular_user_id):
    with app.app_context():
        state = _create_map_hunt_team(regular_user_id)

    login_response = client.post(
        '/register_or_login',
        data={'email': 'user@test.com', 'display_name': 'Test User'},
        follow_redirects=False,
    )
    assert login_response.status_code in (301, 302)

    with client.session_transaction() as sess:
        sess['active_team_id'] = state['team_id']

    return client, state


@pytest.fixture
def legacy_map_hunt_client(app, client, regular_user_id):
    with app.app_context():
        state = _create_map_hunt_team_without_assignments(regular_user_id)

    login_response = client.post(
        '/register_or_login',
        data={'email': 'user@test.com', 'display_name': 'Test User'},
        follow_redirects=False,
    )
    assert login_response.status_code in (301, 302)

    with client.session_transaction() as sess:
        sess['active_team_id'] = state['team_id']

    return client, state


@pytest.fixture
def findloc_client(app, client, regular_user_id):
    with app.app_context():
        state = _create_findloc_team(regular_user_id)

    login_response = client.post(
        '/register_or_login',
        data={'email': 'user@test.com', 'display_name': 'Test User'},
        follow_redirects=False,
    )
    assert login_response.status_code in (301, 302)

    with client.session_transaction() as sess:
        sess['active_team_id'] = state['team_id']

    return client, state


@pytest.fixture
def no_team_admin_client(client, admin_user_id):
    login_response = client.post(
        '/register_or_login',
        data={'email': 'admin@test.com', 'display_name': 'Admin User'},
        follow_redirects=False,
    )
    assert login_response.status_code in (301, 302)

    with client.session_transaction() as sess:
        sess.pop('active_team_id', None)
    return client


class TestGameTypeSeeding:
    def test_findloc_gametype_exists(self, app):
        with app.app_context():
            gametype = GameType.query.filter_by(name='findloc').first()
        assert gametype is not None

    def test_map_hunt_gametype_exists(self, app):
        with app.app_context():
            gametype = GameType.query.filter_by(name='map_hunt').first()
        assert gametype is not None

    def test_gametype_names_are_unique(self, app):
        with app.app_context():
            assert GameType.query.filter_by(name='findloc').count() == 1
            assert GameType.query.filter_by(name='map_hunt').count() == 1


class TestIndexDispatcher:
    def test_unauthenticated_redirects_to_login(self, client):
        response = client.get('/', follow_redirects=False)
        assert response.status_code == 302

    def test_map_hunt_team_redirects_to_map(self, map_hunt_client):
        client, _state = map_hunt_client
        response = client.get('/', follow_redirects=False)
        assert response.status_code == 302
        assert '/map' in response.headers['Location']

    def test_findloc_team_redirects_to_findloc(self, findloc_client):
        client, _state = findloc_client
        response = client.get('/', follow_redirects=False)
        assert response.status_code == 302
        assert '/findloc' in response.headers['Location']


class TestMapRoute:
    def test_unauthenticated_redirected(self, app):
        with app.test_client() as anon_client:
            with anon_client.session_transaction() as sess:
                sess.clear()
            anon_client.get('/logout', follow_redirects=False)
            response = anon_client.get('/map', follow_redirects=False)
        assert response.status_code == 302

    def test_authenticated_no_team_redirected(self, no_team_admin_client):
        response = no_team_admin_client.get('/map', follow_redirects=False)
        assert response.status_code == 302

    def test_map_hunt_player_gets_200(self, map_hunt_client):
        client, _state = map_hunt_client
        response = client.get('/map')
        assert response.status_code == 200

    def test_response_contains_game_data_js(self, map_hunt_client):
        client, _state = map_hunt_client
        response = client.get('/map')
        assert b'GAME_DATA' in response.data

    def test_locations_include_show_pin(self, map_hunt_client):
        client, _state = map_hunt_client
        response = client.get('/map')
        assert b'show_pin' in response.data

    def test_progress_counter_shown(self, map_hunt_client):
        client, _state = map_hunt_client
        response = client.get('/map')
        assert b'found' in response.data

    def test_map_hunt_falls_back_to_game_locations_without_assignments(self, legacy_map_hunt_client):
        client, _state = legacy_map_hunt_client
        response = client.get('/map')
        assert response.status_code == 200
        assert b'Legacy Clue Spot' in response.data

    def test_map_hunt_computes_bounds_from_locations_when_game_bounds_missing(self, legacy_map_hunt_client):
        client, _state = legacy_map_hunt_client
        response = client.get('/map')
        assert response.status_code == 200
        assert b'40.7128' in response.data
        assert b'-74.006' in response.data


class TestLegacyMapAssignments:
    def test_regular_found_endpoint_creates_legacy_map_assignments(self, app, client, regular_user_id):
        with app.app_context():
            state = _create_map_hunt_team_without_assignments(regular_user_id)

        login_response = client.post(
            '/register_or_login',
            data={'email': 'user@test.com', 'display_name': 'Test User'},
            follow_redirects=False,
        )
        assert login_response.status_code in (301, 302)

        rv = client.post(
            f"/api/location/{state['loc_id']}/found",
            json={
                'game_id': state['game_id'],
                'lat': 40.7128,
                'lon': -74.0060,
                'method': 'geo',
            },
        )
        assert rv.status_code == 200
        data = rv.get_json()
        assert data['success'] is True
        assert data['team_progress']['found'] == 1
        assert data['team_progress']['total'] == 1

    def test_admin_confirm_endpoint_creates_legacy_map_assignments(self, app, client, regular_user_id):
        with app.app_context():
            state = _create_map_hunt_team_without_assignments(regular_user_id)

        login_response = client.post(
            '/register_or_login',
            data={'email': 'admin@test.com', 'display_name': 'Admin User'},
            follow_redirects=False,
        )
        assert login_response.status_code in (301, 302)

        rv = client.post(
            f"/api/admin/team/{state['team_id']}/location/{state['loc_id']}/confirm_found",
            json={
                'game_id': state['game_id'],
                'reason': 'debug_mode',
                'client_event_id': 'evt-legacy-map-admin',
            },
        )
        assert rv.status_code == 200
        data = rv.get_json()
        assert data['success'] is True
        assert data['method'] == 'admin_confirm'
        assert data['team_progress']['found'] == 1
        assert data['team_progress']['total'] == 1
