import datetime
import random
from flask import (Blueprint, render_template, redirect, request, jsonify, 
                   url_for,session,
                   Response,current_app,flash)
from flask_login import current_user, login_required
from sqlalchemy.orm import Session

from app.models import (Location, Character, Team, Game, User, 
                        TeamMembership,
                        TeamLocationAssignment,db, team_game)

from app.api import api_bp

from app.main import utils




@api_bp.route('/api/locations', methods=['POST'])
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
