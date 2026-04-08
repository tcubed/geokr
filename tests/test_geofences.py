import uuid

from app import db
from app.models import Game, GameType, Location, Team, TeamLocationAssignment, TeamMembership


def _unique_name(prefix='geofence-game'):
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _get_or_create_gametype(name='findloc'):
    gametype = GameType.query.filter_by(name=name).first()
    if not gametype:
        gametype = GameType(name=name)
        db.session.add(gametype)
        db.session.commit()
    return gametype


def _login_existing_user(client, email='user@test.com', display_name='Test User'):
    return client.post(
        '/register_or_login',
        data={'email': email, 'display_name': display_name},
        follow_redirects=False,
    )


def _create_geofence_team(user_id):
    game = Game(
        name=_unique_name(),
        discoverable='public',
        mode='open',
        gametype=_get_or_create_gametype('findloc'),
        data={
            'branding': {'navbar_color': '#0d6efd'},
            'geofence_settings': {
                'enabled': True,
                'poll_interval_s': 20,
                'default_cooldown_s': 120,
                'default_repeat_every_s': 180,
            },
            'geofences': {
                '1': [
                    {
                        'id': 'stale-placeholder',
                        'shape': 'circle',
                        'center': {'lat': 0, 'lon': 0},
                        'radius_m': 1,
                        'trigger': 'enter',
                        'message': 'placeholder',
                    }
                ]
            },
        },
    )
    db.session.add(game)
    db.session.flush()

    location = Location(
        game_id=game.id,
        name='Fence Location',
        latitude=44.22247,
        longitude=-88.5161,
        clue_text='Stay near the stone wall.',
    )
    db.session.add(location)
    db.session.flush()

    game.data = {
        **(game.data or {}),
        'geofences': {
            str(location.id): [
                {
                    'id': 'arrival-hint',
                    'shape': 'circle',
                    'center': {'lat': 44.22247, 'lon': -88.5161},
                    'radius_m': 75,
                    'trigger': 'enter',
                    'message': 'You are getting close.',
                    'repeat_while': 'inside',
                    'repeat_every_s': 180,
                }
            ]
        }
    }
    db.session.add(game)

    team = Team(
        name=_unique_name('geofence-team'),
        game_id=game.id,
        data={
            'geofence_state': {
                'arrival-hint': {
                    'times_triggered': 1,
                    'last_triggered_at': '2026-04-07T12:00:00Z',
                }
            },
            'geofence_runtime': {
                'arrival-hint': {
                    'location_id': location.id,
                    'current_state': 'inside',
                    'inside': True,
                    'last_transition': 'enter',
                }
            }
        }
    )
    db.session.add(team)
    db.session.flush()

    db.session.add(TeamMembership(user_id=user_id, team_id=team.id, role='captain'))
    db.session.add(
        TeamLocationAssignment(
            team_id=team.id,
            location_id=location.id,
            game_id=game.id,
            order_index=0,
            found=False,
        )
    )
    db.session.commit()
    return {'game_id': game.id, 'team_id': team.id, 'location_id': location.id}


def test_game_model_normalizes_geofence_config(app):
    with app.app_context():
        game = Game(
            name=_unique_name(),
            data={
                'geofence_settings': {
                    'enabled': True,
                    'poll_interval_s': '20',
                    'default_cooldown_s': '90',
                    'default_repeat_every_s': '150',
                },
                'geofences': {
                    '42': [
                        {
                            'shape': 'circle',
                            'center': {'lat': '44.1', 'lon': '-88.2'},
                            'radius_m': '50',
                            'trigger': 'exit',
                            'message': 'Return to the zone.',
                            'repeat_while': 'outside',
                        }
                    ]
                },
            },
        )

        config = game.get_geofence_config()

        assert config['settings']['enabled'] is True
        assert config['settings']['poll_interval_s'] == 20
        assert config['locations']['42'][0]['trigger'] == 'exit'
        assert config['locations']['42'][0]['repeat_while'] == 'outside'
        assert config['locations']['42'][0]['repeat_every_s'] == 150
        assert config['locations']['42'][0]['location_id'] == 42


def test_findloc_page_includes_geofence_payload(app, client, regular_user_id):
    with app.app_context():
        state = _create_geofence_team(regular_user_id)

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    with client.session_transaction() as sess:
        sess['active_team_id'] = state['team_id']

    response = client.get('/findloc')
    assert response.status_code == 200
    assert b'"geofence_settings": {' in response.data
    assert b'"poll_interval_s": 20' in response.data
    assert b'"arrival-hint"' in response.data
    assert b'"team_geofence_runtime": {' in response.data

    client.get('/logout', follow_redirects=False)


def test_offline_bundle_includes_geofences(app, client, regular_user_id):
    with app.app_context():
        state = _create_geofence_team(regular_user_id)

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    with client.session_transaction() as sess:
        sess['active_team_id'] = state['team_id']

    response = client.get(f"/api/game/{state['game_id']}/offline_bundle")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['game']['geofence_settings']['enabled'] is True
    assert str(state['location_id']) in payload['game']['geofences']
    assert payload['team']['geofence_state']['arrival-hint']['times_triggered'] == 1

    client.get('/logout', follow_redirects=False)


def test_team_geofence_state_endpoint_persists_updates(app, client, regular_user_id):
    with app.app_context():
        state = _create_geofence_team(regular_user_id)

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    response = client.post(
        f"/api/team/{state['team_id']}/geofence_state",
        json={
            'geofence_state': {
                'arrival-hint': {
                    'times_triggered': 2,
                    'last_triggered_at': '2026-04-07T12:05:00Z',
                }
            },
            'geofence_runtime': {
                'arrival-hint': {
                    'location_id': state['location_id'],
                    'current_state': 'outside',
                    'inside': False,
                    'last_transition': 'exit',
                }
            }
        },
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['geofence_state']['arrival-hint']['times_triggered'] == 2
    assert payload['geofence_runtime']['arrival-hint']['current_state'] == 'outside'

    with app.app_context():
        team = Team.query.get(state['team_id'])
        assert team.get_geofence_state()['arrival-hint']['times_triggered'] == 2
        assert team.get_geofence_runtime_state()['arrival-hint']['current_state'] == 'outside'

    client.get('/logout', follow_redirects=False)
