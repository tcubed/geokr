import os
import imghdr
import csv
from io import StringIO

from flask import (Blueprint, render_template, request, jsonify, Response,
                   redirect, url_for, flash,current_app,abort)
from flask_login import login_required,current_user
from functools import wraps
from sqlalchemy.orm.attributes import flag_modified
from app.models import (db,
                        Team, team_game,
                        Game,Location, Character, )

from app.admin import admin_bp


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

def admin_required(f):
    """
    Decorator that protects a route by checking for user authentication and admin status.
    """
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        # Check if the current user is authenticated and is an admin
        if not current_user.is_authenticated or not current_user.is_admin:
            # Abort with a 403 Forbidden error if conditions are not met
            abort(403)
        return f(*args, **kwargs)
    return decorated_function

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

# @admin_bp.route('/api/locations')
# #@requires_auth
# def admin_api_locations():
#     from app.models import Location
#     game_id = request.args.get('game_id')
#     if not game_id:
#         return jsonify([])
#     locations = Location.query.filter_by(game_id=game_id).all()
#     return jsonify([{"id": loc.id, "name": loc.name} for loc in locations])

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
    



# ====================================================================
# LOCATION ADMIN
# ====================================================================
@admin_bp.route('/game_locations')
#@requires_auth   # optionally add auth
def manage_game_locations():
    games = Game.query.order_by(Game.name).all()
    return render_template('admin/game_locations.html', games=games)

@admin_bp.route('/export_locations', methods=['GET'])
def export_locations():
    # Fetch all locations from the database
    locations = Location.query.all()

    # In-memory text buffer for the CSV data
    si = StringIO()
    cw = csv.writer(si)

    # Write the CSV header (column names)
    header = [
        "id", "game_id", "name", "latitude", "longitude", 
        "clue_text", "unlock_condition", "image_url", "show_pin"
    ]
    cw.writerow(header)

    # Write data rows
    for location in locations:
        row = [
            location.id, location.game_id, location.name, 
            location.latitude, location.longitude, location.clue_text, 
            location.unlock_condition, location.image_url, location.show_pin
        ]
        cw.writerow(row)

    # Prepare the Flask response with CSV data
    output = si.getvalue()
    si.close()

    response = Response(
        output,
        mimetype="text/csv",
        headers={"Content-disposition": "attachment; filename=locations_export.csv"}
    )
    return response

@admin_bp.route('/import_locations/<int:game_id>', methods=['GET'])
@admin_required
def import_locations_form(game_id):
    game = Game.query.get_or_404(game_id)
    return render_template('admin/import_locations.html', game=game)

@admin_bp.route('/import_locations/<int:game_id>', methods=['POST'])
@admin_required
def import_locations(game_id):
    game = Game.query.get_or_404(game_id)
    # Check if a file was uploaded
    if 'file' not in request.files:
        flash('No file part', 'danger')
        return redirect(url_for('main.import_locations', game_id=game_id))
    
    file = request.files['file']
    if file.filename == '':
        flash('No selected file', 'danger')
        return redirect(url_for('main.import_locations', game_id=game_id))

    if file:
        try:
            # Read the CSV file from memory
            stream = StringIO(file.stream.read().decode("UTF8"), newline=None)
            csv_reader = csv.reader(stream)
            header = next(csv_reader) # Skip the header row
            
            # Dictionary to map CSV headers to model attributes
            csv_to_model_map = {
                'name': 'name',
                'latitude': 'latitude',
                'longitude': 'longitude',
                'clue_text': 'clue_text',
                'unlock_condition': 'unlock_condition',
                'image_url': 'image_url',
                'show_pin': 'show_pin'
            }
            
            imported_count = 0
            for row in csv_reader:
                row_data = dict(zip(header, row))
                
                # Create a new Location object
                location_data = {'game_id': game.id}
                for csv_col, model_attr in csv_to_model_map.items():
                    if csv_col in row_data and row_data[csv_col]:
                        location_data[model_attr] = row_data[csv_col]
                
                new_location = Location(**location_data)
                db.session.add(new_location)
                imported_count += 1
            
            db.session.commit()
            flash(f'Successfully imported {imported_count} locations.', 'success')
            return redirect(url_for('main.manage_game', game_id=game_id))
            
        except Exception as e:
            db.session.rollback()
            flash(f'An error occurred during import: {e}', 'danger')
            return redirect(url_for('main.import_locations', game_id=game_id))

# ====================================================================
# ROUTES ADMIN
# ====================================================================

@admin_bp.route('/game_routes')
#@requires_auth   # optionally add auth
def manage_game_routes():
    games = Game.query.order_by(Game.name).all()
    return render_template('admin/game_routes.html', games=games)

# ----------------------------------------------------------------------
# LEGACY
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


#=============================================================================
# IMAGES
#=============================================================================
# -------------------------------
# GET available images (including subdirectories)
# -------------------------------
@admin_bp.route('/api/images', methods=['GET'])
def get_available_images():
    images_dir = os.path.join(current_app.root_path, 'static/images')
    image_files = []

    try:
        for root, _, files in os.walk(images_dir):
            for f in files:
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
                    # Get the relative path from the static folder
                    rel_path = os.path.relpath(os.path.join(root, f), current_app.root_path)
                    image_files.append(f'/{rel_path.replace(os.path.sep, "/")}')
        return jsonify(image_files)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@admin_bp.route('/api/image-directories', methods=['GET'])
def image_directories():
    base_dir = os.path.join(current_app.root_path, 'static/images')
    dirs = [d for d in os.listdir(base_dir) if os.path.isdir(os.path.join(base_dir, d))]
    return jsonify(dirs)

# WITHOUT PIL
# @admin_bp.route('/api/upload-image', methods=['POST'])
# def upload_image():
#     file = request.files.get('image')
#     directory = request.form.get('directory', '').strip()
#     filename = request.form.get('filename', '').strip()
    
#     if not file or not filename:
#         return jsonify({"success": False, "message": "File and filename required"}), 400

#     target_dir = os.path.join(current_app.root_path, 'static/images', directory)
#     os.makedirs(target_dir, exist_ok=True)
    
#     file_path = os.path.join(target_dir, filename)
#     file.save(file_path)
    
#     # Return relative path like 'gam1/newimage.png'
#     return jsonify({"success": True, "path": f"{directory}/{filename}"})

from PIL import Image

@admin_bp.route('/api/upload-image', methods=['POST'])
def upload_image():
    file = request.files.get('image')
    directory = request.form.get('directory', '').strip()
    filename = request.form.get('filename', '').strip()
    
    if not file or not filename:
        return jsonify({"success": False, "message": "File and filename required"}), 400

    # Infer extension from uploaded file if missing
    if not os.path.splitext(filename)[1]:
        # Try to get from file's mimetype or content
        ext = imghdr.what(file)  # returns 'jpeg', 'png', etc.
        if ext == 'jpeg':
            ext = 'jpg'
        if ext:
            filename += f".{ext}"
        else:
            return jsonify({"success": False, "message": "Cannot determine image type"}), 400


    target_dir = os.path.join(current_app.root_path, 'static/images', directory)
    os.makedirs(target_dir, exist_ok=True)
    
    # Use Pillow to open and resize the image
    try:
        img = Image.open(file)
        max_dim = 640
        img.thumbnail((max_dim, max_dim), Image.ANTIALIAS)  # preserves aspect ratio
        file_path = os.path.join(target_dir, filename)
        img.save(file_path)  # format inferred from filename extension
    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to process image: {e}"}), 500
    
    # Return relative path like 'gam1/newimage.png'
    return jsonify({"success": True, "path": f"{directory}/{filename}"})

