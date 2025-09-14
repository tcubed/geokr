import os
import time
import random
import json
from datetime import datetime, timedelta
from itertools import cycle
from PIL import Image

#from datetime import timedelta
from flask import (Blueprint, render_template, redirect, request, jsonify, 
                   url_for,session,send_from_directory,
                   Response,current_app,flash)
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

from werkzeug.utils import secure_filename
from sqlalchemy import or_, and_


from functools import wraps
from app.models import (db, 
                        User,Role,UserRole,
                        Team, TeamMembership,TeamLocationAssignment,
                        Game, Location, Character, team_game,
                        )

from app.main import main_bp

from app.main import utils
from app.main.cache import deleted_tombstones, cleanup_tombstones


import random


# @main_bp.route('/debug/templates')
# def debug_templates():
#     template_dir = os.path.join(current_app.root_path, 'templates')
#     return '<br>'.join(os.listdir(template_dir))

# @main_bp.route('/test')
# def test():
#     return "Test route is working!"

def get_active_team_db(user):
    # You may want to define "active" more precisely
    membership = (
        db.session.query(TeamMembership)
        .join(Team)
        .filter(TeamMembership.user_id == user.id)
        .filter(Team.end_time == None)  # Team not finished
        .first()
    )
    #session['active_team_id'] = membership.team_id
    return membership.team if membership else None

def get_active_team(user):
    team_id = session.get('active_team_id')
    if team_id:
        team = Team.query.get(team_id)
        if team and team in [m.team for m in user.team_memberships]:
            return team
        # If session team is not valid, fall through to default behavior

    # Default to the first team in their memberships if no active team is set
    if user.team_memberships:
        first_membership = user.team_memberships[0]
        session['active_team_id'] = first_membership.team.id
        return first_membership.team
        
    return None

@main_bp.route('/')
def index():
    #team_id = session.get('active_team_id')

    if current_user.is_authenticated:
        #return redirect(url_for('main.main_page'))
        team_id = session.get('active_team_id')
        if team_id:
            team = Team.query.get(team_id)
            if team and team.game and team.game.gametype:
                gametype = team.game.gametype.name.lower()

                #if gametype == 'navigation':
                #    return redirect(url_for('main.main_page', #game_id=team.game.id
                #                           ))
                #el
                if gametype == 'findloc':
                    return redirect(url_for('main.findloc', #game_id=team.game.id
                                            ))
                else:
                    flash("Unsupported game type for this team.", "warning")
            else:
                flash("Could not find valid team or game info.", "warning")
        else:
            flash("No active team selected.", "warning")
    
    #return redirect(url_for("auth.login"))  # or render landing page template
    return redirect(url_for("auth.register_or_login"))  # or render landing page template

    # Show games whose start date is no older than yesterday
    #yesterday = datetime.utcnow() - timedelta(days=1)
    #games = Game.query.filter(Game.start_time >= yesterday).all()
    #return render_template('index.html', games=games)

#================================================================
# MAP GAME
#================================================================
@main_bp.route('/main')
@login_required
def main_page():
    #team = get_active_team(current_user)
    team_id = session.get('active_team_id')
    if team_id:
        team = Team.query.get(team_id)
    else:
        team = get_active_team(current_user)
        if team:
            session['active_team_id'] = team.id

    if not team:
        current_app.logger.info("main_page: No active team found for user %s", current_user.id)
        return redirect(url_for('main.join_game'))
    game = team.game  # Get the game from the team relationship

    actions=['check_clues']
    # If user has "mapper" role and cookie is set, append "mapper" to actions
    if (
        any(role.role.name == "mapper" for role in current_user.user_roles)
        and request.cookies.get('mapper_mode') == '1'
    ):
        actions.append('mapper')

    return render_template('main.html', team=team, game=game,actions=actions)

#================================================================
#  DEBUG MAP
#================================================================
@main_bp.route('/map/debug')
@login_required
def debug_map():
    team_id = session.get('active_team_id')
    if team_id:
        team = Team.query.get(team_id)
    else:
        team = get_active_team(current_user)
        if team:
            session['active_team_id'] = team.id

    if not team:
        current_app.logger.info("main_page: No active team found for user %s", current_user.id)
        return redirect(url_for('main.join_game'))
    game = team.game  # Get the game from the team relationship

    return render_template("map/debug.html", game=game)

@main_bp.route('/map/map_prefetch')
@login_required
def map_prefetch():
    print("map_prefetch!")
    return render_template("map/map_prefetch.html")

#================================================================
# FIND LOCATION GAME
#================================================================
# Helper to get the active team based on the session or user's memberships

    
@main_bp.route('/findloc')
@login_required
def findloc():
    if not current_user.is_authenticated:
        return redirect(url_for('auth.register_or_login'))

    # Get the active team
    team = get_active_team(current_user)
    
    if not team:
        current_app.logger.info("findloc: No active team found for user %s", current_user.id)
        flash('You must join or create a team to play.', 'info')
        return redirect(url_for('main.account'))
    
    game = team.game  # Get the game from the team relationship

    actions=['check_clues']
    # If user has "mapper" role and cookie is set, append "mapper" to actions
    if (
        any(role.role.name == "mapper" for role in current_user.user_roles)
        and request.cookies.get('mapper_mode') == '1'
    ):
        actions.append('mapper')

    #return render_template('main.html', team=team, game=game,actions=actions)
    # 🧠 Fetch the locations assigned to this team
    assignments = (
        TeamLocationAssignment.query
        .filter_by(team_id=team.id)
        .order_by(TeamLocationAssignment.order_index)
        .all())
    
    locations = []
    current_index = 0
    
    for idx, assignment in enumerate(assignments):
        loc = assignment.location
        img_url = None
        if loc.image_url:
            img_url = url_for('static', filename=f'images/{loc.image_url}')

        loc_data = {
            "id": loc.id,
            "name": loc.name,
            "lat": float(loc.latitude), # Ensure these are floats for JavaScript
            "lon": float(loc.longitude),
            "clue_text": loc.clue_text,
            "image_url": img_url,
            "found": assignment.found
        }
        locations.append(loc_data)

        # Determine the current index (first one not found)
        if not assignment.found:
            # We want the index of the first unfound item.
            current_index = idx
    # Handle the case where all locations are found
    if all(loc['found'] for loc in locations):
        current_index = len(locations)-1

    
    # If all locations are found, set to last index
    # if current_index is None:
    #     current_index = len(assignments) - 1

    #completion_duration = None
    ##if team.end_time and team.start_time:
     #   completion_duration = team.end_time - team.start_time  # timedelta
    # Prepare other data for the template
    completion_duration = team.end_time - team.start_time if team.end_time and team.start_time else None
    
    print('completion_duration:',completion_duration)
    print("Number of locations being sent:", len(locations))

    def format_timedelta(td):
        total_seconds = int(td.total_seconds())
        hours, remainder = divmod(total_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        return f"{hours}h {minutes}m {seconds}s"

    formatted_completion_time = format_timedelta(completion_duration) if completion_duration else None

    # join games
    #games = Game.query.filter_by(discoverable='public').all()
    # teams_by_game = {
    #     game.id: [
    #         {"id": team.id, "name": team.name}
    #         for team in Team.query.filter_by(game_id=game.id).all()
    #     ]
    #     for game in games
    # }

    return render_template("findloc.html",
                           game=game,
                           team=team,
                           locations=locations,
                           current_index=current_index,
                           completion_duration=formatted_completion_time,
                           enable_geolocation=False,
                           enable_selfie=True,
                           enable_image_verify=False,
                           enable_qr_scanner=False,
                           #games=games,
                           #teams_by_game=teams_by_game
                           )
# @main_bp.route('/')
# def index():
#     print("Rendering index.html")
#     game = Game.query.first()  # or however you get the current game
#     return render_template('index.html', game=game)

@main_bp.route('/offline')
def offline():
    return render_template('offline.html')



# @main_bp.route('/switch_team/<int:team_id>')
# @login_required
# def switch_team(team_id):
#     membership = TeamMembership.query.filter_by(user_id=current_user.id, team_id=team_id).first()
#     if not membership:
#         flash("You are not a member of that team.", "danger")
#         return redirect(url_for('main.main_page'))

#     session['active_team_id'] = team_id
#     flash("Switched to new team/game.", "success")

#     game = membership.team.game
#     gametype_name = (game.gametype.name.lower() if game and game.gametype else None)

#     if gametype_name == 'navigation':
#         return redirect(url_for('main.main_page', #game_id=game.id
#                                 ))
#     elif gametype_name == 'findloc':
#         return redirect(url_for('main.findloc', #game_id=game.id
#                                 ))
#     else:
#         flash("Unsupported or undefined game type.", "warning")
#         return redirect(url_for('main.main_page'))





@main_bp.route('/faq')
def faq():
    return render_template('faq.html')

from flask import (
    Blueprint, render_template, request, redirect, url_for, flash, current_app
)
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
import os
#from .models import db, User, Game, Team  # adjust import paths

@main_bp.route('/account', methods=['GET', 'POST'])
@login_required
def account():
    start_time = time.time()
    user = current_user

    # Handle POST updates (account info)
    if request.method == 'POST':
        current_app.logger.info(f"[Account] POST data: {request.form}")
        user.display_name = request.form.get('display_name')
        user.email = request.form.get('email')

        if 'picture' in request.files and request.files['picture'].filename:
            pic = request.files['picture']
            filename = secure_filename(pic.filename)
            pic_path = os.path.join('static', 'uploads', filename)
            os.makedirs(os.path.dirname(pic_path), exist_ok=True)
            pic.save(pic_path)
            user.picture_url = '/' + pic_path.replace('\\', '/')

        db.session.commit()
        flash('Account updated!', 'success')
        print(f"[account, POST] update account: {time.time()-start_time:.4f}s")
        return redirect(url_for('main.account'))

    # Build discoverable games + teams_by_game for “join game” section
    # --- Build games list (discoverable + user's current games) ---
    # 1. Discoverable public games
    discoverable_games = Game.query.filter_by(discoverable='public').all()

    # 2. Games where user already has a team
    user_team_ids = [m.team_id for m in user.team_memberships]
    user_teams = Team.query.filter(Team.id.in_(user_team_ids)).all()
    user_games = [t.game for t in user_teams]

    # Check if the user is on ANY team
    has_game_and_team = bool(user_teams)

    # If the user has teams, set the active_team_id in the session if it's not already there.
    if has_game_and_team and 'active_team_id' not in session:
        # Default to the first team in their list
        session['active_team_id'] = user_teams[0].id

    # Combine and remove duplicates
    all_games_set = {g.id: g for g in discoverable_games}
    for g in user_games:
        all_games_set[g.id] = g  # overwrite/add

    all_games = list(all_games_set.values())

    # Convert to dicts for JS/templating
    games_dicts = [{"id": g.id, "name": g.name} for g in all_games]

    # --- Build teams_by_game ---
    teams_by_game = {}
    for game in all_games:
        teams = Team.query.filter_by(game_id=game.id).all()
        teams_by_game[game.id] = [{"id": t.id, "name": t.name} for t in teams]

    # Build options flags
    debug_mode = request.cookies.get('debug_mode') == '1'
    location_mode = request.cookies.get('location_mode', 'none')  # default "none"

    options = []
    if any(role.role.name == "mapper" for role in current_user.user_roles):
        options.append("mapper")

    print(f"[account, GET] account: {time.time()-start_time:.4f}s")

    return render_template(
        'user/account.html',
        user=user,
        games=games_dicts,
        teams_by_game=teams_by_game,
        debug_mode=debug_mode,
        location_mode=location_mode,
        options=options,
        has_game_and_team=has_game_and_team 
    )

# @main_bp.route('/account_legacy', methods=['GET', 'POST'])
# @login_required
# def account_legacy():
#     # For demo: always use user with id=1
#     #user = User.query.get(1)
#     user = current_user
#     current_app.logger.info(f"[Account] current_user: {user}")

#     if not user:
#         current_app.logger.warning("[Account] current_user is None, creating demo user")
#         user = User(id=1)
#         db.session.add(user)
#         db.session.commit()
#         current_app.logger.info(f"[Account] Created demo user: {user}")

#     if request.method == 'POST':
#         current_app.logger.info(f"[Account] POST data: {request.form}")
#         user.display_name = request.form.get('display_name')
#         user.email = request.form.get('email')
#         current_app.logger.info(f"[Account] Updating user: display_name={user.display_name}, email={user.email}")

#         if 'picture' in request.files and request.files['picture'].filename:
#             pic = request.files['picture']
#             filename = secure_filename(pic.filename)
#             pic_path = os.path.join('static', 'uploads', filename)
#             os.makedirs(os.path.dirname(pic_path), exist_ok=True)
#             pic.save(pic_path)
#             user.picture_url = '/' + pic_path.replace('\\', '/')
#         db.session.commit()

#         current_app.logger.info(f"[Account] User updated and committed: {user}")
#         flash('Account updated!', 'success')
#         return redirect(url_for('main.findloc'))
#         #return redirect(url_for('main.main_page'))

#     current_app.logger.info(f"[Account] Rendering account page for user: {user}")
#     return render_template('user/account.html', user=user)



# # GET route — renders the page with discoverable games
# @main_bp.route('/joingame', methods=['GET'])
# @login_required
# def joingame_page():
#     games = Game.query.filter_by(discoverable='public').all()
#     teams_by_game = {
#         game.id: [
#             {"id": team.id, "name": team.name}
#             for team in Team.query.filter_by(game_id=game.id).all()
#         ]
#         for game in games
#     }
#     return render_template('user/joingame.html', games=games, teams_by_game=teams_by_game)

# POST route — joins or creates a team (JSON response)
@main_bp.route('/api/joingame', methods=['POST'])
@login_required
def api_joingame():
    """Join an existing team or create a new team for a game.
    Returns JSON indicating success and the user's team_id.
    If already on a team, returns success with current team_id.
    """
    print("[api_joingame] current_user:", current_user.is_authenticated)
    
    start_time=time.time()
    data = request.get_json(silent=True)
    print(f"[api_joingame] DEBUG: Data received from request.get_json(): {data}")
    current_app.logger.debug("[api_joingame] Data: %s", data)
    if not data:
        print("[api_joingame] DEBUG: Data is None. Returning 400.")
        return jsonify({"success": False, "message": "Missing or invalid JSON data"}), 400

    try:
        # game_id = data.get('game_id')
        # team_id = data.get('team_id')
        # new_team_name = data.get('new_team_name', '').strip()
        game_id = int(data.get('game_id')) if data.get('game_id') else None
        team_id = int(data.get('team_id')) if data.get('team_id') else None
        new_team_name = (data.get('new_team_name') or '').strip()
        print(f"[api_joingame] DEBUG: new_team_name is: {new_team_name}")
    except Exception as e:
        current_app.logger.exception("Error joining game")
        return jsonify({"success": False, "message": str(e)}), 500

    if not game_id:
        return jsonify({"success": False, "message": "Missing game_id"}), 400

    # Check if user is already a member of any team in this game
    existing_membership = (
        db.session.query(TeamMembership)
        .join(Team)
        .filter(TeamMembership.user_id == current_user.id)
        .filter(Team.game_id == game_id)
        .first()
    )

    if existing_membership:
        # 🌟 Already on a team: treat as success, send team info
        return jsonify({
            "success": True,
            "team_id": existing_membership.team_id,
            "already_on_team": True,
            "message": f"You are already on team '{existing_membership.team.name}'."
        })
    
    if team_id:  # Join existing team
        membership = TeamMembership(user_id=current_user.id, team_id=team_id)
        db.session.add(membership)
        db.session.commit()
        session['active_team_id'] = membership.team_id
        print(f"[api_joingame] join existing team: {time.time()-start_time:.4f}s")
        return jsonify({
            "success": True,
            "team_id": team_id,
            "already_on_team": False,
            "message": "Joined team successfully."
        })
    
    elif new_team_name:  # Create new team
        # Check for team name uniqueness before creating
        if Team.query.filter_by(game_id=game_id, name=new_team_name).first():
            return jsonify({"success": False, "message": "Team name already exists."}), 409

        team = Team(name=new_team_name, game_id=game_id)
        db.session.add(team)
        db.session.commit()

        membership = TeamMembership(user_id=current_user.id, team_id=team.id, role='captain')
        db.session.add(membership)
        db.session.commit()
        
        # 🌟 Correct the return statement to use the new team's ID
        session['active_team_id'] = team.id

        print(f"[api_joingame] create new team: {time.time()-start_time:.4f}s")

        return jsonify({
            "success": True,
            "team_id": team.id,
            "already_on_team": False,
            "message": "Created team and joined successfully."
        })
    
    print(f"[api_joingame] send back, need to do something: {time.time()-start_time:.4f}s")
    return jsonify({"success": False, "message": "Must select or create a team."}), 400


@main_bp.route('/api/switch_team', methods=['POST'])
@login_required
def switch_team():
    # Get the JSON data from the request body
    data = request.get_json()
    if not data or 'team_id' not in data:
        return jsonify({"success": False, "message": "Missing 'team_id' in request body."}), 400
    team_id = data.get('team_id')

    # Query for the membership
    membership = TeamMembership.query.filter_by(user_id=current_user.id, team_id=team_id).first()
    if not membership:
        return jsonify({"success": False, "message": "You are not a member of that team."}), 403

    # Update server-side session (for online users)
    session['active_team_id'] = team_id

    game = membership.team.game
    gametype_name = (game.gametype.name.lower() if game and game.gametype else None)

    return jsonify({
        "success": True,
        "team_id": team_id,
        "game_id": game.id if game else None,
        "gametype": gametype_name,
        "message": f"Switched to team '{membership.team.name}'"
    })


# ======================================================================
# LOCATIONS
# ======================================================================
@main_bp.route('/new_pin', methods=['GET', 'POST'])
@login_required
def new_pin():
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    if request.method == 'POST':
        title = request.form.get('title')
        description = request.form.get('description')

        team = get_active_team(current_user)
        if not team:
            flash("No active team found.", "danger")
            return redirect(url_for('main.main_page'))
        game_id = team.game_id

        # Save the new pin/location here (implement as needed)
        # Example:
        new_location = Location(
            game_id=game_id,  # set as appropriate
            name=title,
            latitude=lat,
            longitude=lon,
            clue_text=description
        )
        db.session.add(new_location)

        # Update game bounds
        game = Game.query.get(game_id)
        if game:
            game.update_bounds_from_locations()

        db.session.commit()

        flash('New pin added!', 'success')
        return redirect(url_for('main.main_page'))
    return render_template('game/new_pin.html', lat=lat, lon=lon)


@main_bp.route('/location/<int:location_id>')
@login_required
def location(location_id):
    location = Location.query.get_or_404(location_id)
    return render_template('game/location.html', location=location)

@main_bp.route('/api/location/found', methods=['POST'])
@login_required
def mark_location_found():
    # --- Data and File Handling Section ---
    photo = None
    data = {}
    if 'photo' in request.files:
        photo = request.files['photo']
        if photo.filename == '':
            current_app.logger.error("No image file provided, but 'photo' key exists.")
            return jsonify({"error": "No image file provided"}), 400
        
        # All other data comes from the form
        try:
            # Flask's request.form is a CombinedMultiDict, which we can treat like a dictionary
            # It will have a key 'data' containing the JSON string
            json_data_str = request.form.get('data')
            if json_data_str:
                data = json.loads(json_data_str)
                current_app.logger.info("Successfully parsed JSON data from multipart form.")
            else:
                current_app.logger.error("Multipart request is missing the 'data' key.")
                return jsonify({"error": "Missing required data payload"}), 400
        except json.JSONDecodeError:
            current_app.logger.error("Invalid JSON data in multipart request.")
            return jsonify({"error": "Invalid JSON payload"}), 400

    else:
        # Fallback for non-image submissions
        try:
            data = request.get_json()
            current_app.logger.info(f"Request is JSON. Payload: {data}")
        except Exception as e:
            current_app.logger.error(f"Failed to parse JSON: {e}")
            return jsonify({"error": "Invalid JSON"}), 400

    # --- Initial Validation ---
    team_id = data.get('team_id')
    location_id = data.get('location_id')
    game_id = data.get('game_id')
    method = data.get('method')

    if not all([team_id, location_id, game_id,method]):
        current_app.logger.error(f"Missing required parameters. Data: {data}")
        return jsonify({"error": "Missing required parameters"}), 400

    # --- Database Operations ---
    cleanup_tombstones()  # remove expired tombstones

    key = (team_id, location_id, game_id)
    if key in deleted_tombstones:
        return jsonify({
            "success": False,
            "team_id": team_id,
            "location_id": location_id,
            "message": "This assignment was recently deleted",
        }), 409
    
    tla = TeamLocationAssignment.query.filter_by(
        team_id=team_id, location_id=location_id, game_id=game_id
    ).first()

    if not tla:
        # If no assignment exists, create one
        tla = TeamLocationAssignment(
            team_id=team_id,
            location_id=location_id,
            game_id=game_id,
            found=True,
            timestamp_found=datetime.utcnow()
        )
        db.session.add(tla)
    else:
        # Mark found if not already
        if not tla.found:
            tla.found = True
            tla.timestamp_found = datetime.utcnow()

    # Handle the image submission if applicable
    if method == 'selfie' and photo:
        current_app.logger.info(f"Processing selfie for team {team_id}, location {location_id}.")
        # 1. Sanitize filename & define path
        filename = secure_filename(photo.filename)
        # Generate a unique filename to avoid collisions
        unique_filename = f"{team_id}-{location_id}-{datetime.utcnow().timestamp()}-{filename}"
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename)
        
        # 2. Process and save the image
        try:
            from io import BytesIO
            img_stream = BytesIO(photo.read())
            img = Image.open(img_stream)
            max_dim = 640
            img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
            img.save(filepath)
            current_app.logger.info(f"Image saved successfully to {filepath}")
        except Exception as e:
            db.session.rollback() # Rollback any changes
            current_app.logger.error(f"Image processing or saving failed: {e}")
            return jsonify({"success": False, "message": f"Failed to process image: {e}"}), 500

        # 3. Update the Team's .data attribute
        team = Team.query.filter_by(id=team_id).first()
        if team:
            try:
                team_data = json.loads(team.data) if team.data else {}
            except json.JSONDecodeError:
                current_app.logger.warning(f"Invalid JSON in team {team_id} data field. Resetting.")
                team_data = {}
            if 'selfies' not in team_data:
                team_data['selfies'] = {}
            team_data['selfies'][location_id] = filepath
            team.data = json.dumps(team_data)
            current_app.logger.info(f"Updated team {team_id} data with selfie path.")


    db.session.commit()

    # Compute current_index for client display
    from sqlalchemy import func
    found_count = db.session.query(func.count(TeamLocationAssignment.id))\
        .filter_by(team_id=team_id, game_id=game_id, found=True).scalar()
    current_index = max(0, found_count - 1)

    current_app.logger.info("Returning success response.")
    return jsonify({
        "success": True,
        "team_id": team_id,
        "location_id": location_id,
        "found": tla.found,
        "timestamp_found": tla.timestamp_found.isoformat(),
        "current_index": current_index
    })

@main_bp.route('/api/team/<int:team_id>/locations', methods=['GET'])
@login_required
def get_team_locations(team_id):
    assignments = TeamLocationAssignment.query.filter_by(team_id=team_id).all()

    results = []
    for a in assignments:
        results.append({
            "location_id": a.location_id,
            "found": a.found,
            "timestamp_found": a.timestamp_found.isoformat() if a.timestamp_found else None
        })

    return jsonify(results)





@main_bp.route('/game_admin')
@login_required
def game_admin():
    if not current_user.is_admin:
        flash("You don't have permission to view that page.", "warning")
        return redirect(url_for('main.index'))  # or any other page
    games = Game.query.order_by(Game.start_time.desc()).all()
    return render_template('game/game_admin.html', games=games)

@main_bp.route('/game_status')
@login_required
def game_status():
    """
    Renders a page showing the status of all games, including team selfies.
    """
    all_games = Game.query.order_by(Game.name).all()
    
    # Get selected game IDs from the query string
    selected_games_param = request.args.get('games')
    selected_game_ids = []
    if selected_games_param:
        selected_game_ids = [int(gid) for gid in selected_games_param.split(',') if gid.isdigit()]
    
    # If no games are selected, get all games
    if not selected_game_ids:
        games_to_process = all_games
    else:
        games_to_process = Game.query.filter(Game.id.in_(selected_game_ids)).order_by(Game.name).all()
    
    serializable_games = []
    for game in games_to_process:
        # Create a dictionary for the game
        game_data = {
            'id': game.id,
            'name': game.name,
            'locations': [{'id': loc.id} for loc in game.locations]
        }
        
        # Add teams data
        teams_data = []
        for team in Team.query.filter_by(game_id=game.id).order_by(Team.name).all():
            # Check if data is a string and parse it
            if team.data and isinstance(team.data, str):
                try:
                    team.data = json.loads(team.data)
                except json.JSONDecodeError:
                    team.data = {}
            
            teams_data.append({
                'id': team.id,
                'name': team.name,
                'data': team.data
            })
        
        game_data['teams'] = teams_data
        serializable_games.append(game_data)
        
    locations_map = {loc.id: {'id': loc.id, 'name': loc.name} for loc in Location.query.all()}
    
    # Pass the serializable data to the template
    return render_template(
        'game/game_status.html',
        all_games=all_games,
        games_with_data=serializable_games,
        locations_map=locations_map
    )




@main_bp.route('/service-worker.js')
def service_worker():
    return send_from_directory('..', 'service-worker.js')




# @main_bp.route('/joingame', methods=['GET', 'POST'])
# @login_required
# def join_game():
#     # Show games that are active
#     #yesterday = datetime.utcnow() - timedelta(days=1)
#     #games = Game.query.filter(Game.start_time >= yesterday).all()

#     now = datetime.utcnow()
#     # games = Game.query.filter(
#     #     or_(
#     #         Game.mode == 'open',
#     #         and_(
#     #             Game.mode == 'competitive',
#     #             or_(Game.join_deadline == None, Game.join_deadline >= now)
#     #         )
#     #     )
#     # ).all()

#     games = Game.query.filter_by(discoverable='public').all()


#     teams_by_game = {
#         game.id: [
#             {"id": team.id, "name": team.name}
#             for team in Team.query.filter_by(game_id=game.id).all()
#         ]
#         for game in games
#     }
#     if request.method == 'POST':
#         game_id = request.form.get('game_id')
#         team_id = request.form.get('team_id')
#         new_team_name = request.form.get('new_team_name')

#         # Check if user is already a member of any team in this game
#         existing_membership = (
#             db.session.query(TeamMembership)
#             .join(Team)
#             .filter(TeamMembership.user_id == current_user.id)
#             .filter(Team.game_id == game_id)
#             .first()
#         )

#         if team_id:  # Join existing team
#             # If user is already a member of this team, redirect
#             already_on_team = (
#                 TeamMembership.query.filter_by(user_id=current_user.id, team_id=team_id).first()
#             )
#             if already_on_team:
#                 flash("You are already a member of this team.", "info")
#                 return redirect(url_for('main.main_page'))
#             # If user is on a different team in this game, prevent joining another
#             if existing_membership:
#                 flash("You are already on a team for this game.", "warning")
#                 return redirect(url_for('main.main_page'))
#             # Otherwise, add membership
#             membership = TeamMembership(user_id=current_user.id, team_id=team_id)
#             session['active_team_id'] = membership.team_id
#             db.session.add(membership)
#             db.session.commit()
#             return redirect(url_for('main.main_page'))
    
#         elif new_team_name:  # Create new team
#             # If user is already on a team in this game, prevent creating another
#             if existing_membership:
#                 flash("You are already on a team for this game.", "warning")
#                 return redirect(url_for('main.main_page'))
#             # Create new team and membership
#             team = Team(name=new_team_name, game_id=game_id)
#             db.session.add(team)
#             db.session.commit()
#             membership = TeamMembership(user_id=current_user.id, team_id=team.id, role='captain')
#             session['active_team_id'] = membership.team_id
#             db.session.add(membership)
#             db.session.commit()
#             return redirect(url_for('main.main_page'))

#     return render_template('joingame.html', games=games, teams_by_game=teams_by_game)