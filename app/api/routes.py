import datetime
import random
from itertools import cycle
from sqlalchemy.orm.attributes import flag_modified

from flask import (Blueprint, render_template, redirect, request, jsonify, 
                   url_for,session,abort,
                   Response,current_app,flash)
from flask_login import current_user, login_required
from functools import wraps

from sqlalchemy.orm import Session

from app.models import (Location, Character, Team, Game, User, 
                        TeamMembership,
                        TeamLocationAssignment,db, team_game)

from app.api import api_bp

from app.main import utils

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

@api_bp.route('/api/get_nearby_locations', methods=['POST'])
# used to be /api/locations
def get_nearby_locations():
    data = request.get_json()
    #lat, lon = data['latitude'], data['longitude']
    lat = data.get('latitude')
    lon = data.get('longitude')
    game_id = data.get('game_id')
    if not game_id:
        return jsonify({"error": "game_id required"}), 400
    
    # If latitude or longitude are missing, use the first location's coordinates for the game
    if lat is None or lon is None:
        location = Location.query.filter_by(game_id=game_id).first()
        if location:
            lat = location.latitude
            lon = location.longitude
        else:
            return jsonify([])  # No locations for this game
    
    print(f"Received coordinates: ({lat}, {lon}) for game_id: {game_id}")

    locations = Location.query.filter_by(game_id=game_id).all()
    results = []
    for loc in locations:
        dist = utils.haversine(lat, lon, loc.latitude, loc.longitude)
        print(f"Checking location: {loc.name} at ({loc.latitude}, {loc.longitude}), distance: {dist} meters")
        
        if dist < 1000:  # meters
            results.append({
                'id': loc.id,
                'name': loc.name,
                'clue': loc.clue_text,
                'latitude': loc.latitude,
                'longitude': loc.longitude,
            })
    return jsonify(results)

@api_bp.route('/api/interact/<int:char_id>')
def interact(char_id):
    char = Character.query.get_or_404(char_id)
    return jsonify({
        'name': char.name,
        'dialogue': char.dialogue
    })

@api_bp.route('/api/team', methods=['POST'])
def create_team():
    data = request.get_json()
    name = data.get('name')
    game_ids = data.get('game_ids', [])

    if not name or not game_ids:
        return jsonify({"error": "name and game_ids required"}), 400

    from app.models import Team, Game, db
    team = Team(name=name)
    for gid in game_ids:
        game = Game.query.get(gid)
        if game:
            team.games.append(game)
    db.session.add(team)
    db.session.commit()

    return jsonify({"message": "Team created", "team_id": team.id})

@api_bp.route('/api/team/progress/<int:team_id>')
def team_progress(team_id):
    team = Team.query.get(team_id)
    if not team:
        return jsonify({"error": "Invalid team"}), 400
    return jsonify({"clues_found": team.clues_found or []})

@api_bp.route('/api/game/<int:game_id>/team_locations', methods=['GET'])
#@login_required  # optional, if you want to limit to authenticated users
def get_team_location_assignments(game_id):
    # You could restrict this further to only return the requesting user's team if desired
    my_team = current_user.team_memberships[0].team  # adjust if user can be on multiple teams
    #assignments = TeamLocationAssignment.query.filter_by(game_id=game_id).all()
    assignments = TeamLocationAssignment.query.filter_by(game_id=game_id, team_id=my_team.id).all()

    result = {}
    for assignment in assignments:
        team_id = assignment.team_id
        if team_id not in result:
            result[team_id] = {
                "team_name": assignment.team.name,
                "locations": []
            }
        result[team_id]["locations"].append({
            "location_id": assignment.location_id,
            "location_name": assignment.location.name,
            "image_url": assignment.location.image_url,  # adjust as needed
            "latitude": assignment.location.latitude,
            "longitude": assignment.location.longitude,
            "found": assignment.found,
            "timestamp_found": assignment.timestamp_found.isoformat() if assignment.timestamp_found else None
        })

    return jsonify(result)


# Adjustable distance threshold in meters
PROXIMITY_THRESHOLD_METERS = 30

@api_bp.route('/api/found_location', methods=['POST'])
@login_required
def mark_location_found_legacy():
    data = request.get_json()
    game_id = data.get("game_id")
    location_id = data.get("location_id")
    user_lat = data.get("lat")
    user_lon = data.get("lon")

    if not all([game_id, location_id, user_lat, user_lon]):
        return jsonify({"error": "Missing required fields"}), 400

    # Find user's team for this game
    membership = TeamMembership.query.join(Team).filter(
        TeamMembership.user_id == current_user.id,
        Team.game_id == game_id
    ).first()

    if not membership:
        return jsonify({"error": "User is not part of a team in this game"}), 403

    assignment = TeamLocationAssignment.query.filter_by(
        team_id=membership.team_id,
        location_id=location_id,
        game_id=game_id
    ).first()

    if not assignment:
        return jsonify({"error": "Location not assigned to your team"}), 404

    if assignment.found:
        return jsonify({"message": "Location already marked as found"}), 200

    # Get target location coordinates
    target_lat = assignment.location.lat
    target_lon = assignment.location.lon

    # Calculate distance using haversine
    distance = utils.haversine(user_lat, user_lon, target_lat, target_lon)

    if distance > PROXIMITY_THRESHOLD_METERS:
        return jsonify({
            "message": "Too far from location",
            "distance_m": round(distance, 2)
        }), 403

    # Close enough — mark as found
    assignment.found = True
    assignment.timestamp_found = datetime.utcnow()
    db.session.commit()

    return jsonify({
        "message": "Location marked as found",
        "distance_m": round(distance, 2)
    }), 200

@api_bp.route('/api/found_location_simple/<int:location_id>', methods=['POST'])
@login_required
def mark_location_found_simple(location_id):
    # Optional: confirm current user is admin here

    # Find the team assignment for current user’s active team
    team_id = session.get('active_team_id')
    if not team_id:
        # fallback: find the team from membership or deny access
        return redirect(url_for('main.findloc'))

    assignment = TeamLocationAssignment.query.filter_by(
        team_id=team_id,
        location_id=location_id
    ).first()

    if not assignment:
        # Could abort(404) or flash error
        return redirect(url_for('main.findloc'))

    if not assignment.found:
        assignment.found = True
        assignment.timestamp_found = datetime.datetime.utcnow()

        # Check if all locations assigned to the team are now found
        all_found = all(a.found for a in assignment.team.location_assignments)
        if all_found and assignment.team.end_time is None:
            assignment.team.end_time = datetime.datetime.utcnow()
            flash("You Finished!", "success")  # <--- Flash success message here

        db.session.commit()

    return redirect(url_for('main.findloc'))

def build_progress_response(assignment):
    team = assignment.team
    game = assignment.game

    # Calculate progress
    all_assignments = TeamLocationAssignment.query.filter_by(team_id=team.id).all()
    total = len(all_assignments)
    found = sum(1 for a in all_assignments if a.found)

    # Find next location (not found yet)
    next_loc = next((a.location for a in all_assignments if not a.found), None)

    return {
        "status": "found" if assignment.found else "pending",
        "location_id": assignment.location_id,
        "team_progress": {
            "found": found,
            "total": total
        },
        "next_location": {
            "id": next_loc.id,
            "name": next_loc.name,
            "lat": next_loc.latitude,
            "lon": next_loc.longitude
        } if next_loc else None,
        "message": "Location marked as found"
    }


@api_bp.route('/api/location/<int:location_id>/found', methods=['POST'])
@login_required
def mark_location_found(location_id):
    data = request.get_json() or {}
    game_id = data.get("game_id")
    user_lat = data.get("lat")
    user_lon = data.get("lon")
    force = data.get("force", False)

    # Validate input
    if not game_id:
        return jsonify({"error": "Missing game_id"}), 400

    # Check user's team for this game
    membership = TeamMembership.query.join(Team).filter(
        TeamMembership.user_id == current_user.id,
        Team.game_id == game_id
    ).first()

    if not membership:
        return jsonify({"error": "User is not part of a team in this game"}), 403

    assignment = TeamLocationAssignment.query.filter_by(
        team_id=membership.team_id,
        location_id=location_id,
        game_id=game_id
    ).first()

    if not assignment:
        return jsonify({"error": "Location not assigned to your team"}), 404

    # Check if already found (idempotent behavior)
    if assignment.found:
        return jsonify(build_progress_response(assignment)), 200

    # Admin override (force) check
    if force and current_user.has_role("admin"):  # Assuming you have a role system
        assignment.found = True
        assignment.timestamp_found = datetime.utcnow()
        db.session.commit()
        return jsonify(build_progress_response(assignment)), 200

    # Normal mode: check proximity
    if not (user_lat and user_lon):
        return jsonify({"error": "Missing lat/lon for proximity check"}), 400

    # Calculate distance
    target_lat = assignment.location.latitude
    target_lon = assignment.location.longitude
    distance = utils.haversine(user_lat, user_lon, target_lat, target_lon)

    if distance > PROXIMITY_THRESHOLD_METERS:
        return jsonify({
            "message": "Too far from location",
            "distance_m": round(distance, 2)
        }), 403

    # Mark as found
    assignment.found = True
    assignment.timestamp_found = datetime.utcnow()
    db.session.commit()

    return jsonify(build_progress_response(assignment)), 200



@api_bp.route('/api/tile-list')
def tile_list():
    # Example bounding box around a campus
    min_lat = float(request.args.get('min_lat'))
    min_lng = float(request.args.get('min_lng'))
    max_lat = float(request.args.get('max_lat'))
    max_lng = float(request.args.get('max_lng'))
    zooms = request.args.get('zooms', '14,15,16')
    zoom_levels = [int(z) for z in zooms.split(',')]

    tile_url_template = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"

    tiles = utils.generate_tile_urls(min_lat, min_lng, max_lat, max_lng, zoom_levels, tile_url_template)
    return jsonify(tiles)

# ============================================================
# GAME
# ============================================================

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


@api_bp.route('/api/game/<int:game_id>/start_game', methods=['POST'])
@admin_required
def start_game(game_id):
    game = Game.query.get(game_id)
    if not game:
        return jsonify({"success": False, "message": "Game not found"}), 404
    
    try:
        # Delete existing assignments for this game
        deleted_count = TeamLocationAssignment.query.filter_by(game_id=game_id).delete()
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": f"Failed to clear old assignments: {str(e)}"}), 500

    try:
        # Assign new locations
        assign_locations_to_teams(game.id)
    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to assign locations: {str(e)}"}), 500

    return jsonify({
        "success": True,
        "message": f"Game '{game.name}' started and locations assigned!",
        "game_id": game.id,
        "deleted_assignments": deleted_count
    }), 200

@api_bp.route('/api/game/<int:game_id>/clear_assignments', methods=['POST'])
#@login_required
@admin_required
def clear_assignments(game_id):
    try:
        # Delete all TeamLocationAssignment rows for this game
        deleted_count = TeamLocationAssignment.query.filter_by(game_id=game_id).delete()
        db.session.commit()
        return jsonify({
            "success": True,
            "message": f"Deleted all {deleted_count} team location assignments for game {game_id}."
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": f"Failed to delete team location assignments: {str(e)}"
        }), 500
    

@api_bp.route('/api/team/<int:team_id>/reset_locations', methods=['POST'])
#@login_required
@admin_required
def reset_locations(team_id):
    """
    Reset all locations (TeamLocationAssignment) found flags and timestamps
    for the current team and game. Debug only.
    """
    #team_id = request.json.get('team_id') or session.get('active_team_id')
    if not team_id:
        return jsonify({"error": "team_id is required"}), 400

    team = Team.query.get(team_id)
    if not team:
        return jsonify({"error": f"No team found with id {team_id}"}), 404

    # Reset all assignments for this team
    assignments = TeamLocationAssignment.query.filter_by(team_id=team.id).all()
    for a in assignments:
        a.found = False
        a.timestamp_found = None  # reset timestamp if you have one
    db.session.commit()

    return jsonify({
        "message": f"Reset {len(assignments)} location assignments for team {team.name} (id={team.id})"
    })


@api_bp.route('/api/game/state', methods=['GET'])
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

# ====================================================================
# LOCATION ADMIN
# ====================================================================
# ----------------------------------------------------------------------
# 1. Get all locations for a game
# GET /api/locations?game_id=1
@api_bp.route('/api/locations', methods=['GET'])
def get_game_locations():
    game_id = request.args.get('game_id', type=int)
    if not game_id:
        return jsonify([])

    locations = Location.query.filter_by(game_id=game_id).all()
    return jsonify([
        {
            "id": loc.id,
            "name": loc.name,
            "clue_text": loc.clue_text,
            "image_url": loc.image_url,
            "latitude": loc.latitude,
            "longitude": loc.longitude,
        } for loc in locations
    ])

# ----------------------------------------------------------------------
# 2. Get / update a single location by ID
# GET /api/location/123
# PUT /api/location/123
@api_bp.route('/api/location/<int:loc_id>', methods=['GET', 'PUT','DELETE'])
@admin_required
def location_detail(loc_id):
    loc = Location.query.get_or_404(loc_id)

    if request.method == 'GET':
        return jsonify({
            "id": loc.id,
            "name": loc.name,
            "clue_text": loc.clue_text,
            "image_url": loc.image_url,
            "latitude": loc.latitude,
            "longitude": loc.longitude,
        })

    elif request.method == 'PUT':
        data = request.get_json()
        loc.name = data.get("name", loc.name)
        loc.clue_text = data.get("clue_text", loc.clue_text)
        loc.image_url = data.get("image", loc.image_url)
        loc.latitude = data.get("latitude", loc.latitude)
        loc.longitude = data.get("longitude", loc.longitude)

        db.session.commit()
        return jsonify({"success": True, "message": "Location updated", "location": {
            "id": loc.id,
            "name": loc.name,
            "clue_text": loc.clue_text,
            "image_url": loc.image_url,
            "latitude": loc.latitude,
            "longitude": loc.longitude,
        }})

    elif request.method == 'DELETE':
        db.session.delete(loc)
        db.session.commit()
        return jsonify({"success": True, "message": f"Location {loc_id} deleted"})

# ----------------------------------------------------------------------
# 3. Add a new location
# POST /api/locations
# Body: { "game_id": 1, "name": "...", "clue_text": "...", "image": "...", "latitude": 0.0, "longitude": 0.0 }
@api_bp.route('/api/locations', methods=['POST'])
@admin_required
def add_location():
    data = request.get_json()
    game_id = data.get("game_id")
    if not game_id:
        return jsonify({"success": False, "message": "game_id required"}), 400

    new_loc = Location(
        game_id=game_id,
        name=data.get("name", "New Location"),
        clue_text=data.get("clue_text", ""),
        image_url=data.get("image", ""),
        latitude=data.get("latitude", 0.0),
        longitude=data.get("longitude", 0.0),
    )
    db.session.add(new_loc)
    db.session.commit()
    return jsonify({"success": True, "message": "Location added", "location": {
        "id": new_loc.id,
        "name": new_loc.name,
        "clue_text": new_loc.clue_text,
        "image_url": new_loc.image_url,
        "latitude": new_loc.latitude,
        "longitude": new_loc.longitude,
    }})

# ====================================================================
# ROUTES ADMIN
# ====================================================================
# ------------------ Get All Routes for a Game ------------------
@api_bp.route('/api/game/<int:game_id>/routes', methods=['GET'])
#@login_required
def game_routes(game_id):
    """
    Return all routes for a given game.
    """
    game = Game.query.get_or_404(game_id)
    game.data = game.data or {}
    routes = game.data.get('routes', [])
    return jsonify(routes=routes)

# ------------------ Game Route Detail ------------------
@api_bp.route('/api/game/<int:game_id>/route/<int:route_idx>', methods=['GET', 'PUT', 'DELETE'])
@admin_required
def game_route_detail(game_id, route_idx):
    """
    Manage a single route of a game.
    - GET: return the route as list of location IDs
    - PUT: update the route
    - DELETE: remove the route
    """
    game = Game.query.get_or_404(game_id)
    game.data = game.data or {}
    routes = game.data.get('routes', [])

    # Validate route index
    if route_idx < 0 or route_idx >= len(routes):
        return jsonify(error="Route index out of range"), 404

    if request.method == 'GET':
        return jsonify(route=routes[route_idx])

    elif request.method == 'PUT':
        payload = request.get_json()
        new_route = payload.get('route')
        if not isinstance(new_route, list):
            return jsonify(error="Route must be a list of location IDs"), 400
        # Optional: ensure all IDs are ints
        try:
            routes[route_idx] = [int(loc_id) for loc_id in new_route]
        except ValueError:
            return jsonify(error="All location IDs must be integers"), 400

        game.data['routes'] = routes
        db.session.commit()
        return jsonify(success=True, route=routes[route_idx])

    elif request.method == 'DELETE':
        deleted_route = routes.pop(route_idx)
        game.data['routes'] = routes
        db.session.commit()
        return jsonify(success=True, deleted_route=deleted_route)

@api_bp.route('/api/game/<int:game_id>/routes', methods=['POST'])
@admin_required
def add_game_route(game_id):
    """
    Append a new route to a game.
    Expects JSON: { "route": [location_id, location_id, ...] }
    """
    game = Game.query.get_or_404(game_id)
    game.data = game.data or {}
    routes = game.data.get('routes', [])

    payload = request.get_json()
    new_route = payload.get('route')
    if not isinstance(new_route, list):
        return jsonify(error="Route must be a list of location IDs"), 400

    try:
        new_route = [int(loc_id) for loc_id in new_route]
    except ValueError:
        return jsonify(error="All location IDs must be integers"), 400

    routes.append(new_route)
    game.data['routes'] = routes
    db.session.commit()
    return jsonify(success=True, route=new_route, route_index=len(routes)-1)

@api_bp.route('/api/game/<int:game_id>/routes/all', methods=['POST'])
@admin_required
def save_all_routes(game_id):
    """
    Replaces all routes for a given game with the new list of routes.
    Expects JSON: { "routes": [[loc_id, loc_id, ...], [loc_id, loc_id, ...], ...] }
    """
    game = Game.query.get_or_404(game_id)
    payload = request.get_json()

    if not payload or 'routes' not in payload:
        return jsonify(error="Missing 'routes' in request body"), 400

    new_routes = payload.get('routes')

    if not isinstance(new_routes, list):
        return jsonify(error="Routes must be a list"), 400

    # Validate that all elements are lists of integers
    validated_routes = []
    try:
        for route in new_routes:
            if not isinstance(route, list):
                return jsonify(error="All routes must be lists"), 400
            validated_routes.append([int(loc_id) for loc_id in route])
    except (ValueError, TypeError):
        return jsonify(error="All location IDs must be integers"), 400

    # Update the game data and commit to the database
    game.data['routes'] = validated_routes

    # Explicitly tell SQLAlchemy that the dictionary has been modified
    flag_modified(game, "data")
    
    db.session.commit()

    return jsonify(success=True, message="All routes saved successfully!", routes=validated_routes)
