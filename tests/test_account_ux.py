from app import db as _db
from app.models import Game, GameType, Team, TeamMembership


def _login_existing_user(client, email='user@test.com', display_name='Test User'):
    return client.post(
        '/register_or_login',
        data={'email': email, 'display_name': display_name},
        follow_redirects=False,
    )


def _get_or_create_gametype(name='findloc'):
    gametype = GameType.query.filter_by(name=name).first()
    if not gametype:
        gametype = GameType(name=name)
        _db.session.add(gametype)
        _db.session.flush()
    return gametype


def _create_branded_team(user_id, *, game_name, team_name, navbar_color, icon_alt):
    gametype = _get_or_create_gametype('findloc')

    game = Game(
        name=game_name,
        gametype_id=gametype.id,
        data={
            'branding': {
                'icon_url': 'icons/apple-touch-icon.png',
                'icon_alt': icon_alt,
                'navbar_color': navbar_color,
            }
        },
    )
    _db.session.add(game)
    _db.session.flush()

    team = Team(name=team_name, game_id=game.id)
    _db.session.add(team)
    _db.session.flush()

    _db.session.add(TeamMembership(user_id=user_id, team_id=team.id, role='captain'))
    _db.session.commit()
    game_id = game.id
    team_id = team.id
    _db.session.remove()

    return {
        'game_id': game_id,
        'team_id': team_id,
        'game_name': game_name,
        'team_name': team_name,
        'navbar_color': navbar_color,
        'icon_alt': icon_alt,
    }


def test_account_page_uses_active_team_branding(app, client, regular_user_id):
    with app.app_context():
        state = _create_branded_team(
            regular_user_id,
            game_name='Branded Alpha',
            team_name='Alpha Team',
            navbar_color='#2255aa',
            icon_alt='Alpha Brand',
        )

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    with client.session_transaction() as sess:
        sess['_user_id'] = str(regular_user_id)
        sess['_fresh'] = True
        sess['active_team_id'] = state['team_id']

    response = client.get('/account')

    assert response.status_code == 200
    assert b'--bs-primary: #2255aa;' in response.data
    assert b'Ready for offline play' in response.data
    assert b'Download to this device' in response.data
    assert b'Game: Branded Alpha' in response.data
    assert b'Team: Alpha Team' in response.data

    client.get('/logout', follow_redirects=False)



def test_switch_team_api_changes_account_theme_context(app, client, regular_user_id):
    with app.app_context():
        first = _create_branded_team(
            regular_user_id,
            game_name='Branded Beta',
            team_name='Beta Team',
            navbar_color='#118833',
            icon_alt='Beta Brand',
        )
        second = _create_branded_team(
            regular_user_id,
            game_name='Branded Gamma',
            team_name='Gamma Team',
            navbar_color='#993355',
            icon_alt='Gamma Brand',
        )

    login_response = _login_existing_user(client)
    assert login_response.status_code in (301, 302)

    with client.session_transaction() as sess:
        sess['_user_id'] = str(regular_user_id)
        sess['_fresh'] = True
        sess['active_team_id'] = first['team_id']

    switch_response = client.post('/api/switch_team', json={'team_id': second['team_id']})
    assert switch_response.status_code == 200

    payload = switch_response.get_json()
    assert payload['success'] is True
    assert payload['team']['id'] == second['team_id']
    assert payload['game']['id'] == second['game_id']
    assert payload['branding']['navbar_color'] == '#993355'
    assert payload['branding']['icon_alt'] == 'Gamma Brand'

    response = client.get('/account')
    assert response.status_code == 200
    assert b'--bs-primary: #993355;' in response.data
    assert b'Game: Branded Gamma' in response.data
    assert b'Team: Gamma Team' in response.data

    client.get('/logout', follow_redirects=False)


def test_admin_account_options_enable_troubleshooting_checkboxes(client):
    login_response = _login_existing_user(client, 'admin@test.com', 'Admin User')
    assert login_response.status_code in (301, 302)

    response = client.get('/account')
    assert response.status_code == 200

    body = response.data.decode('utf-8')
    assert 'id="default_pos_mode" name="default_pos_mode" disabled' not in body
    assert 'id="debug_mode" name="debug_mode" disabled' not in body

    client.get('/logout', follow_redirects=False)
