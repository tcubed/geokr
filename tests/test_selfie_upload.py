import json
import re
from io import BytesIO

from PIL import Image

from app import db as _db
from app.models import Game, GameType, Location, Team, TeamLocationAssignment, TeamMembership


def _login_existing_user(client, email, display_name):
    return client.post(
        '/register_or_login',
        data={'email': email, 'display_name': display_name},
        follow_redirects=False,
    )


def _create_selfie_game(user_id):
    gametype = GameType.query.filter_by(name='findloc').first()
    if not gametype:
        gametype = GameType(name='findloc')
        _db.session.add(gametype)
        _db.session.flush()

    game = Game(name='Selfie Upload Test', gametype_id=gametype.id)
    _db.session.add(game)
    _db.session.flush()

    location = Location(
        game_id=game.id,
        name='Selfie Spot',
        latitude=44.0,
        longitude=-88.0,
        clue_text='Take a selfie here',
        show_pin=True,
    )
    _db.session.add(location)
    _db.session.flush()

    team = Team(name='Selfie Team', game_id=game.id)
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
    return {'game_id': game.id, 'team_id': team.id, 'location_id': location.id}


def _make_test_image_bytes():
    image = Image.new('RGB', (24, 24), color=(40, 120, 200))
    buf = BytesIO()
    image.save(buf, format='JPEG')
    buf.seek(0)
    return buf


def test_selfie_submission_writes_upload_and_team_metadata(app, client, regular_user_id, tmp_path):
    with app.app_context():
        state = _create_selfie_game(regular_user_id)

    app.config['UPLOAD_FOLDER'] = str(tmp_path)

    login_rv = _login_existing_user(client, 'user@test.com', 'Test User')
    assert login_rv.status_code in (301, 302)

    image_bytes = _make_test_image_bytes()
    payload = {
        'team_id': state['team_id'],
        'location_id': state['location_id'],
        'game_id': state['game_id'],
        'method': 'selfie',
    }

    rv = client.post(
        '/api/location/found',
        data={
            'data': json.dumps(payload),
            'photo': (image_bytes, 'selfie-test.jpg'),
        },
        content_type='multipart/form-data',
    )

    assert rv.status_code == 200
    data = rv.get_json()
    assert data['success'] is True
    assert data['location_id'] == state['location_id']

    saved_files = list(tmp_path.iterdir())
    assert len(saved_files) == 1
    assert re.fullmatch(r'selfie-team-\d{4}-[0-9a-f]{6}-selfie\.jpg', saved_files[0].name)

    with app.app_context():
        team = Team.query.get(state['team_id'])
        selfies = team.data.get('selfies', {})
        stored_name = selfies.get(state['location_id']) or selfies.get(str(state['location_id']))
        assert stored_name == saved_files[0].name