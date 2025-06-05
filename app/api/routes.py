from flask import (Blueprint, render_template, redirect, request, jsonify, 
                   url_for,
                   Response,current_app,flash)
from app.models import (Location, Character, Team, Game, User, db, team_game)

from app.api import api_bp
from app.main import utils


@api_bp.route('/api/locations', methods=['POST'])
def get_nearby_locations():
    data = request.get_json()
    lat, lon = data['latitude'], data['longitude']
    game_id = data.get('game_id')
    if not game_id:
        return jsonify({"error": "game_id required"}), 400
    
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