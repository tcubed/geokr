import os
from datetime import datetime, timedelta

#from datetime import timedelta
from flask import (Blueprint, render_template, redirect, request, jsonify, 
                   url_for,
                   Response,current_app,flash)
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

from werkzeug.utils import secure_filename

from functools import wraps
from app.models import (Location, Character, Team, Game, User, db, team_game,
                        TeamMembership)

from app.main import main_bp

from app.main import utils
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
    return membership.team if membership else None

@main_bp.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('main.main_page'))
    # Show games whose start date is no older than yesterday
    yesterday = datetime.utcnow() - timedelta(days=1)
    games = Game.query.filter(Game.start_time >= yesterday).all()
    return render_template('index.html', games=games)

@main_bp.route('/main')
@login_required
def main_page():
    team = get_active_team(current_user)
    if not team:
        current_app.logger.info("main_page: No active team found for user %s", current_user.id)
        return redirect(url_for('main.join_game'))
    game = team.game  # Get the game from the team relationship
    return render_template('main.html', team=team, game=game)
# @main_bp.route('/')
# def index():
#     print("Rendering index.html")
#     game = Game.query.first()  # or however you get the current game
#     return render_template('index.html', game=game)

@main_bp.route('/joingame', methods=['GET', 'POST'])
@login_required
def join_game():
    # Show games that are active
    yesterday = datetime.utcnow() - timedelta(days=1)
    games = Game.query.filter(Game.start_time >= yesterday).all()
    teams_by_game = {
        game.id: [
            {"id": team.id, "name": team.name}
            for team in Team.query.filter_by(game_id=game.id).all()
        ]
        for game in games
    }
    if request.method == 'POST':
        game_id = request.form.get('game_id')
        team_id = request.form.get('team_id')
        new_team_name = request.form.get('new_team_name')

        if team_id:  # Join existing team
            team = Team.query.get(team_id)
            if team:
                membership = TeamMembership(user_id=current_user.id, team_id=team.id)
                db.session.add(membership)
                db.session.commit()
                return redirect(url_for('main.main_page'))
        elif new_team_name:  # Create new team
            team = Team(name=new_team_name, game_id=game_id)
            db.session.add(team)
            db.session.commit()
            membership = TeamMembership(user_id=current_user.id, team_id=team.id, role='captain')
            db.session.add(membership)
            db.session.commit()
            return redirect(url_for('main.main_page'))

    return render_template('joingame.html', games=games, teams_by_game=teams_by_game)

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
    return render_template('user/options.html', debug_mode=debug_mode, watch_position=watch_position)

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
    return render_template('user/register.html')

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
    return render_template('user/login.html')

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

    return render_template('user/account.html', user=user)




