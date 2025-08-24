import os
import random
from datetime import datetime, timedelta
from itertools import cycle

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
from itertools import cycle

# @main_bp.route('/debug/templates')
# def debug_templates():
#     template_dir = os.path.join(current_app.root_path, 'templates')
#     return '<br>'.join(os.listdir(template_dir))

# @main_bp.route('/test')
# def test():
#     return "Test route is working!"

def get_active_team(user):
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

                if gametype == 'navigation':
                    return redirect(url_for('main.main_page', #game_id=team.game.id
                                            ))
                elif gametype == 'findloc':
                    return redirect(url_for('main.findloc', #game_id=team.game.id
                                            ))
                else:
                    flash("Unsupported game type for this team.", "warning")
            else:
                flash("Could not find valid team or game info.", "warning")
        else:
            flash("No active team selected.", "warning")
    
    return redirect(url_for("auth.login"))  # or render landing page template
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
@main_bp.route('/findloc')
@login_required
def findloc():
    #team = get_active_team(current_user)
    team_id = session.get('active_team_id')
    if team_id:
        team = Team.query.get(team_id)
    else:
        team = get_active_team(current_user)
        if team:
            session['active_team_id'] = team.id

    if not team:
        current_app.logger.info("findloc: No active team found for user %s", current_user.id)
        return redirect(url_for('main.join_game'))
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
    assignments = TeamLocationAssignment.query.filter_by(team_id=team.id).all()
    #locations = [assignment.location for assignment in assignments]

    # Collect locations up to and including the first one not found
    # limited_assignments = []
    # for assignment in assignments:
    #     limited_assignments.append(assignment)
    #     if not assignment.found:
    #         break

    # #locations = [a.location for a in limited_assignments]
    # location_data = [(a.location, a.found) for a in limited_assignments]


    # for loc,found in location_data:
    #     print(loc.name, loc.latitude, loc.longitude, loc.clue_text)
    locations = []
    current_index = None
    for idx, assignment in enumerate(assignments):
        loc = assignment.location
        img_url = None
        if loc.image_url:
            img_url = url_for('static', filename=f'images/{loc.image_url}')  # Converts "game1/img1.png" → "/static/game1/img1.png"


        loc_data = {
            "id": loc.id,
            "name": loc.name,
            "lat": loc.latitude,
            "lon": loc.longitude,
            "clue_text": loc.clue_text,
            "image_url": img_url,
            "found": assignment.found
        }
        locations.append(loc_data)
        if current_index is None and not assignment.found:
            current_index = idx

    # If all locations are found, set to last index
    if current_index is None:
        current_index = len(assignments) - 1

    completion_duration = None
    if team.end_time and team.start_time:
        completion_duration = team.end_time - team.start_time  # timedelta
    print('completion_duration:',completion_duration)
    print("Number of locations being sent:", len(locations))

    def format_timedelta(td):
        total_seconds = int(td.total_seconds())
        hours, remainder = divmod(total_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        return f"{hours}h {minutes}m {seconds}s"

    formatted_completion_time = format_timedelta(completion_duration) if completion_duration else None


    return render_template("findloc.html",
                           game=game,
                           team=team,
                           locations=locations,
                           current_index=current_index,
                           completion_duration=formatted_completion_time,
                           enable_geolocation=False,
                           enable_selfie=False,
                           enable_image_verify=False,
                           enable_qr_scanner=False,
                           )
# @main_bp.route('/')
# def index():
#     print("Rendering index.html")
#     game = Game.query.first()  # or however you get the current game
#     return render_template('index.html', game=game)

@main_bp.route('/offline')
def offline():
    return render_template('offline.html')

# GET route — renders the page with discoverable games
@main_bp.route('/joingame', methods=['GET'])
@login_required
def joingame_page():
    games = Game.query.filter_by(discoverable='public').all()
    teams_by_game = {
        game.id: [
            {"id": team.id, "name": team.name}
            for team in Team.query.filter_by(game_id=game.id).all()
        ]
        for game in games
    }
    return render_template('user/joingame.html', games=games, teams_by_game=teams_by_game)

# POST route — joins or creates a team (JSON response)
@main_bp.route('/api/joingame', methods=['POST'])
@login_required
def api_joingame():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "message": "Missing data"}), 400

    game_id = data.get('game_id')
    team_id = data.get('team_id')
    new_team_name = data.get('new_team_name', '').strip()

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

    if team_id:  # Join existing team
        if existing_membership:
            return jsonify({"success": False, "message": "Already on a team in this game."}), 403

        membership = TeamMembership(user_id=current_user.id, team_id=team_id)
        db.session.add(membership)
        db.session.commit()
        session['active_team_id'] = membership.team_id
        return jsonify({"success": True, "team_id": team_id, "message": "Joined team successfully."})

    elif new_team_name:  # Create new team
        if existing_membership:
            return jsonify({"success": False, "message": "Already on a team in this game."}), 403

        team = Team(name=new_team_name, game_id=game_id)
        db.session.add(team)
        db.session.commit()

        membership = TeamMembership(user_id=current_user.id, team_id=team.id, role='captain')
        db.session.add(membership)
        db.session.commit()
        session['active_team_id'] = membership.team_id

        return jsonify({"success": True, "team_id": team.id, "message": "Created team and joined successfully."})

    return jsonify({"success": False, "message": "Must select or create a team."}), 400

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

@main_bp.route('/api/switch_team/<int:team_id>', methods=['POST'])
@login_required
def switch_team(team_id):
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



@main_bp.route('/options')
@login_required
def options():
    debug_mode = request.cookies.get('debug_mode') == '1'
    watch_position = request.cookies.get('watch_position')
    # Convert to boolean: checked if '1', unchecked if '0' or not set
    if watch_position is None:
        watch_position = True  # default ON
    else:
        watch_position = (watch_position == '1')

    options=[]
    # Check if user has "mapper" role
    if any(role.role.name == "mapper" for role in current_user.user_roles):
        options.append("mapper")

    return render_template('user/options.html', debug_mode=debug_mode, 
                           watch_position=watch_position,
                           options=options)

@main_bp.route('/faq')
def faq():
    return render_template('faq.html')


@main_bp.route('/account', methods=['GET', 'POST'])
@login_required
def account():
    # For demo: always use user with id=1
    #user = User.query.get(1)
    user = current_user
    if not user:
        user = User(id=1)
        db.session.add(user)
        db.session.commit()

    if request.method == 'POST':
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
        return redirect(url_for('main.main_page'))

    return render_template('user/account.html', user=user)

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
    data = request.get_json()
    team_id = data.get('team_id')
    location_id = data.get('location_id')
    game_id = data.get('game_id')

    if not all([team_id, location_id, game_id]):
        return jsonify({"error": "Missing required parameters"}), 400

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

    db.session.commit()

    # Compute current_index for client display
    from sqlalchemy import func
    found_count = db.session.query(func.count(TeamLocationAssignment.id))\
        .filter_by(team_id=team_id, game_id=game_id, found=True).scalar()
    current_index = max(0, found_count - 1)

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



def assign_locations_to_teams(game_id):
    game = Game.query.get(game_id)
    if not game:
        raise ValueError(f"Game with ID {game_id} not found.")

    teams = Team.query.filter_by(game_id=game_id).all()
    if not teams:
        raise ValueError(f"No teams found for game ID {game_id}.")
    
    # Check if 'routes' is defined in game.data
    routes = None
    num_locations_per_team=5
    if game.data and isinstance(game.data, dict):
        routes = game.data.get('routes')
        num_locations_per_team = game.data.get('num_locations_per_team', num_locations_per_team)
    
    created_count = 0
    if routes and isinstance(routes, list) and all(isinstance(r, list) for r in routes):
        # Assign based on predefined routes
        route_cycle = cycle(routes)  # Cycle through routes if there are more teams than routes
        for team in teams:
            route = next(route_cycle)
            for loc_id in route:
                exists = TeamLocationAssignment.query.filter_by(
                    team_id=team.id, location_id=loc_id, game_id=game_id
                ).first()
                if not exists:
                    assignment = TeamLocationAssignment(
                        team_id=team.id,
                        location_id=loc_id,
                        game_id=game_id
                    )
                    db.session.add(assignment)
                    created_count += 1
    else:
        # Fallback: Random assignment
        all_location_ids = [loc.id for loc in Location.query.filter_by(game_id=game_id).all()]
        for team in teams:
            assigned = random.sample(all_location_ids, min(num_locations_per_team, len(all_location_ids)))
            for loc_id in assigned:
                exists = TeamLocationAssignment.query.filter_by(
                    team_id=team.id, location_id=loc_id, game_id=game_id
                ).first()
                if not exists:
                    assignment = TeamLocationAssignment(
                        team_id=team.id,
                        location_id=loc_id,
                        game_id=game_id
                    )
                    db.session.add(assignment)
                    created_count += 1

    db.session.commit()
    return f"Assigned {created_count} location(s) to teams in game {game_id}."


@main_bp.route('/start_game/<int:game_id>', methods=['POST'])
@login_required
def start_game(game_id):
    game = Game.query.get(game_id)
    if not game:
        return {"error": "Game not found"}, 404
    
    assign_locations_to_teams(game.id)
    #return {"message": f"Locations assigned to teams for Game {game.name}"}, 200
    flash(f"Game '{game.name}' started and locations assigned!", "success")
    return redirect(url_for('main.index'))

@main_bp.route('/game_admin')
@login_required
def game_admin():
    if not current_user.is_admin:
        flash("You don't have permission to view that page.", "warning")
        return redirect(url_for('main.index'))  # or any other page
    games = Game.query.order_by(Game.start_time.desc()).all()
    return render_template('game/game_admin.html', games=games)

@main_bp.route('/service-worker.js')
def service_worker():
    return send_from_directory('..', 'service-worker.js')

@main_bp.route('/api/game/state', methods=['GET'])
@login_required
def get_game_state():
    game_id = request.args.get('game_id', type=int)
    team_id = request.args.get('team_id', type=int)

    if not game_id or not team_id:
        return jsonify({"error": "Missing game_id or team_id"}), 400

    # Query all locations for this game assigned to this team
    assignments = TeamLocationAssignment.query.filter_by(
        game_id=game_id,
        team_id=team_id
    ).order_by(TeamLocationAssignment.id).all()

    locations_found = []
    current_index = 0
    for idx, a in enumerate(assignments):
        locations_found.append({
            "location_id": a.location_id,
            "found": a.found,
            "timestamp_found": a.timestamp_found.isoformat() if a.timestamp_found else None
        })
        if a.found:
            current_index = idx + 1  # current_index points to next location to find

    return jsonify({
        "game_id": game_id,
        "team_id": team_id,
        "current_index": current_index,
        "locations_found": locations_found
    })

@main_bp.route('/debug/reset-locations', methods=['POST'])
@login_required
def reset_locations():
    """
    Reset all locations (TeamLocationAssignment) found flags and timestamps
    for the current team and game. Debug only.
    """
    team_id = request.json.get('team_id') or session.get('active_team_id')
    if not team_id:
        return jsonify({"error": "team_id is required"}), 400

    team = Team.query.get(team_id)
    if not team:
        return jsonify({"error": f"No team found with id {team_id}"}), 404

    # Reset all assignments for this team
    assignments = TeamLocationAssignment.query.filter_by(team_id=team.id).all()
    for a in assignments:
        a.found = False
        a.found_at = None  # reset timestamp if you have one
    db.session.commit()

    return jsonify({
        "message": f"Reset {len(assignments)} location assignments for team {team.id}"
    })
