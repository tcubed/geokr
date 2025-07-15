import datetime
import random
from flask import (Blueprint, render_template, redirect, request, jsonify, 
                   url_for,
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
def mark_location_found():
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




