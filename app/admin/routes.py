from flask import (Blueprint, render_template, request, jsonify, Response,
                   redirect, url_for, flash)
from flask_login import login_required
from functools import wraps
from app.models import (db,
                        Team, team_game,
                        Game,Location, Character, )

from app.admin import admin_bp


from flask import render_template


def check_auth(username, password):
    return username == 'admin' and password == 'secret'

def authenticate():
    return Response(
        'Login required', 401,
        {'WWW-Authenticate': 'Basic realm="Login Required"'})

def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)
    return decorated


@admin_bp.route('/load_sample_data')
@requires_auth
def load_sample_data():
    from app.models import db, Location, Character

    # Create a sample game
    game = Game(name="Fox Crossing", description="A test game.")
    db.session.add(game)
    db.session.flush()  # Assigns an ID to game

    loc1 = Location(name="Driveway", latitude=44.22247, longitude=-88.5161, clue_text="Look beneath the leaves.", game_id=game.id)
    loc2 = Location(name="Rock garden", latitude=44.222386, longitude=-88.515669, clue_text="Someone carved initials here.", game_id=game.id)

    db.session.add_all([loc1, loc2])
    db.session.flush()

    char1 = Character(name="Old Man Willow", bio="Knows the woods well.", location_id=loc1.id, dialogue="Ah, I've seen many seekers come and go...", game_id=game.id)
    char2 = Character(name="Sunny Sam", bio="Enjoys riddles.", location_id=loc2.id, dialogue="What has roots as nobody sees...", game_id=game.id)

    db.session.add_all([char1, char2])
    db.session.commit()
    return "Sample data loaded."

@admin_bp.route('/clear')
@requires_auth
def clear_data():
    from app.models import db, Location, Character, Team, Game, team_game
    db.session.query(team_game).delete()
    db.session.query(Team).delete()
    db.session.query(Character).delete()
    db.session.query(Location).delete()
    db.session.query(Game).delete()
    db.session.commit()
    return "All data cleared."



@admin_bp.route('/games')
@requires_auth
def admin_games_page():
    print("Rendering admin_games.html")
    return render_template('admin_games.html')

@admin_bp.route('/teams')
@requires_auth
def admin_teams_page():
    return render_template('admin_teams.html')

@admin_bp.route('/characters')
@requires_auth
def admin_characters_page():
    print("Rendering admin_characters.html")
    return render_template('admin_characters.html')


@admin_bp.route('/api/games', methods=['GET', 'POST'])
#@requires_auth
def admin_api_games():
    from app.models import Game, db
    if request.method == 'POST':
        data = request.get_json()
        game = Game(name=data['name'], description=data.get('description', ''))
        db.session.add(game)
        db.session.commit()
        return jsonify({"message": "Game added"})
    else:
        games = Game.query.all()
        return jsonify([{"id": g.id, "name": g.name, "description": g.description} for g in games])

@admin_bp.route('/api/teams', methods=['GET', 'POST'])
@requires_auth
def admin_api_teams():
    from app.models import Team, Game, db
    if request.method == 'POST':
        data = request.get_json()
        team = Team(name=data['name'])
        for gid in data.get('game_ids', []):
            game = Game.query.get(gid)
            if game:
                team.games.append(game)
        db.session.add(team)
        db.session.commit()
        return jsonify({"message": "Team added"})
    else:
        teams = Team.query.all()
        teams_list = []
        for t in teams:
            teams_list.append({
                "id": t.id,
                "name": t.name,
                "games": [{"id": g.id, "name": g.name} for g in t.games]
            })
        return jsonify(teams_list)



@admin_bp.route('/api/characters', methods=['GET', 'POST'])
@requires_auth
def admin_api_characters():
    from app.models import Character, Location, Game, db
    if request.method == 'POST':
        data = request.get_json()
        name = data.get('name')
        location_id = data.get('location_id')
        bio = data.get('bio', '')
        dialogue = data.get('dialogue', '')
        game_id = data.get('game_id')

        location = Location.query.get(location_id)
        if not location:
            return jsonify({"error": "Invalid location ID"}), 400

        character = Character(
            name=name,
            bio=bio,
            dialogue=dialogue,
            location_id=location_id,
            game_id=game_id
        )
        db.session.add(character)
        db.session.commit()
        return jsonify({"message": "Character added"})

    else:
        characters = Character.query.join(Location).join(Game).all()
        result = []
        for c in characters:
            result.append({
                "id": c.id,
                "name": c.name,
                "bio": c.bio,
                "dialogue": c.dialogue,
                "location_id": c.location_id,
                "location_name": c.location.name if c.location else None,
                "game_id": c.game_id,
                "game_name": c.game.name if c.game else None
            })
        return jsonify(result)

@admin_bp.route('/api/locations')
#@requires_auth
def admin_api_locations():
    from app.models import Location
    game_id = request.args.get('game_id')
    if not game_id:
        return jsonify([])
    locations = Location.query.filter_by(game_id=game_id).all()
    return jsonify([{"id": loc.id, "name": loc.name} for loc in locations])

@admin_bp.route('/api/characters/<int:id>', methods=['PUT', 'DELETE'])
@requires_auth
def admin_api_character_detail(id):
    from app.models import Character, Location, db
    character = Character.query.get_or_404(id)

    if request.method == 'PUT':
        data = request.get_json()
        name = data.get('name')
        location_id = data.get('location_id')
        description = data.get('description', '')

        location = Location.query.get(location_id)
        if not location:
            return jsonify({"error": "Invalid location ID"}), 400

        character.name = name
        character.location = location
        character.description = description
        db.session.commit()
        return jsonify({"message": "Character updated"})

    elif request.method == 'DELETE':
        db.session.delete(character)
        db.session.commit()
        return jsonify({"message": "Character deleted"})
    


@admin_bp.route('/copy_locations', methods=['GET', 'POST'])
@login_required  # optionally add @admin_required if needed
def copy_locations():
    games = Game.query.order_by(Game.name).all()

    if request.method == 'POST':
        source_id = int(request.form['source_game'])
        dest_id = int(request.form['destination_game'])

        if source_id == dest_id:
            flash("Source and destination games must be different.", "danger")
            return redirect(url_for('main.copy_locations'))

        source_game = Game.query.get_or_404(source_id)
        dest_game = Game.query.get_or_404(dest_id)

        count = 0
        for loc in source_game.locations:
            copied = Location(
                game_id=dest_game.id,
                name=loc.name,
                latitude=loc.latitude,
                longitude=loc.longitude,
                image_url=loc.image_url,
                clue_text=loc.clue_text,
                #description=loc.description,
                
            )
            db.session.add(copied)
            count += 1

        db.session.commit()
        flash(f"Copied {count} locations from '{source_game.name}' to '{dest_game.name}'.", "success")
        return redirect(url_for('admin_cust.copy_locations'))

    return render_template('admin/copy_locations.html', games=games)
