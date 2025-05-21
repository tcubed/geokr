import os
#from datetime import timedelta
from flask import (Blueprint, render_template, redirect, request, jsonify, 
                   url_for,
                   Response,current_app,flash)
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

from werkzeug.utils import secure_filename

from functools import wraps
from app.models import (Location, Character, Team, Game, User, db, team_game)

from app.main import main_bp

from app.main import utils
# @main_bp.route('/debug/templates')
# def debug_templates():
#     template_dir = os.path.join(current_app.root_path, 'templates')
#     return '<br>'.join(os.listdir(template_dir))

# @main_bp.route('/test')
# def test():
#     return "Test route is working!"

@main_bp.route('/')
def index():
    print("Rendering index.html")
    game = Game.query.first()  # or however you get the current game
    return render_template('index.html', game=game)

@main_bp.route('/faq')
def faq():
    return render_template('faq.html')

@main_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form['email']
        display_name = request.form['display_name']
        password = request.form['password']
        if User.query.filter_by(email=email).first():
            flash('Email already registered.', 'danger')
            return redirect(url_for('main.register'))
        user = User(email=email, display_name=display_name,
                    password_hash=generate_password_hash(password))
        db.session.add(user)
        db.session.commit()
        flash('Registration successful. Please log in.', 'success')
        return redirect(url_for('main.login'))
    return render_template('register.html')

@main_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        user = User.query.filter_by(email=email).first()
        if user and check_password_hash(user.password_hash, password):
            login_user(user,remember=True)
            flash('Logged in successfully.', 'success')
            return redirect(url_for('main.account'))
        flash('Invalid credentials.', 'danger')
    return render_template('login.html')

@main_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Logged out.', 'success')
    return redirect(url_for('main.login'))

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
        return redirect(url_for('main.account'))

    return render_template('account.html', user=user)

@main_bp.route('/api/locations', methods=['POST'])
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

@main_bp.route('/api/interact/<int:char_id>')
def interact(char_id):
    char = Character.query.get_or_404(char_id)
    return jsonify({
        'name': char.name,
        'dialogue': char.dialogue
    })

@main_bp.route('/api/team', methods=['POST'])
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



