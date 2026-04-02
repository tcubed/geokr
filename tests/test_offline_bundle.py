"""
Tests for Sprint 03 Phase 0/1 foundations:
  - offline bundle endpoint
  - auth/access control around bundle download
"""

from datetime import datetime

from app import db as _db
from app.models import Character, Game, GameType, Location, Team, TeamLocationAssignment, TeamMembership


def _login_existing_user(client, email, display_name):
    return client.post(
        '/register_or_login',
        data={'email': email, 'display_name': display_name},
        follow_redirects=False,
    )


def _create_offline_bundle_game(user_id):
    gametype = GameType.query.filter_by(name='map_hunt').first()
    if not gametype:
        gametype = GameType(name='map_hunt')
        _db.session.add(gametype)
        _db.session.flush()

    game = Game(
        name='Offline Bundle Test',
        gametype_id=gametype.id,
        description='Offline bundle fixture game',
        min_lat=44.0,
        max_lat=44.01,
        min_lon=-88.0,
        max_lon=-87.99,
        data={
            'branding': {
                'icon_url': 'icons/test-icon.png',
                'icon_alt': 'Test Brand',
            },
            'offline_zooms': [14],
        },
    )
    _db.session.add(game)
    _db.session.flush()

    loc1 = Location(
        game_id=game.id,
        name='North Gate',
        latitude=44.0005,
        longitude=-87.9995,
        clue_text='Start at the north gate',
        image_url='uploads/gate.jpg',
        show_pin=True,
    )
    loc2 = Location(
        game_id=game.id,
        name='Library Steps',
        latitude=44.0095,
        longitude=-87.9905,
        clue_text='Climb the steps',
        show_pin=False,
    )
    _db.session.add_all([loc1, loc2])
    _db.session.flush()

    char1 = Character(
        game_id=game.id,
        name='Guide',
        bio='Helpful guide',
        location_id=loc1.id,
        dialogue='Welcome to the trail',
    )
    _db.session.add(char1)
    _db.session.flush()

    team = Team(name='Offline Team', game_id=game.id)
    _db.session.add(team)
    _db.session.flush()

    _db.session.add(TeamMembership(user_id=user_id, team_id=team.id, role='captain'))
    _db.session.add_all([
        TeamLocationAssignment(
            team_id=team.id,
            location_id=loc1.id,
            game_id=game.id,
            order_index=0,
            found=True,
            timestamp_found=datetime.utcnow(),
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
        'location_ids': [loc1.id, loc2.id],
    }


def test_offline_bundle_requires_login(app):
    with app.test_client() as anon_client:
        with anon_client.session_transaction() as sess:
            sess.clear()
        anon_client.get('/logout', follow_redirects=False)
        rv = anon_client.get('/api/game/1/offline_bundle', follow_redirects=False)
    assert rv.status_code in (301, 302)


def test_offline_bundle_returns_team_game_data(app, client, regular_user_id):
    with app.app_context():
        state = _create_offline_bundle_game(regular_user_id)

    login_rv = _login_existing_user(client, 'user@test.com', 'Test User')
    assert login_rv.status_code in (301, 302)

    rv = client.get(f"/api/game/{state['game_id']}/offline_bundle")
    assert rv.status_code == 200

    data = rv.get_json()
    assert data['bundle_version'] == 1
    assert data['game']['id'] == state['game_id']
    assert data['game']['gametype'] == 'map_hunt'
    assert data['team']['id'] == state['team_id']
    assert data['team']['progress']['found'] == 1
    assert data['team']['progress']['total'] == 2
    assert len(data['locations']) == 2
    assert 'show_pin' in data['locations'][0]
    assert 'image_url' in data['locations'][0]
    assert len(data['characters']) == 1
    assert data['tiles']['zooms'] == [14]
    assert len(data['tiles']['urls']) > 0


def test_offline_bundle_for_non_member_is_forbidden(app, client, regular_user_id):
    with app.app_context():
        state = _create_offline_bundle_game(regular_user_id)

    login_rv = _login_existing_user(client, 'admin@test.com', 'Admin User')
    assert login_rv.status_code in (301, 302)

    rv = client.get(f"/api/game/{state['game_id']}/offline_bundle")
    assert rv.status_code == 403