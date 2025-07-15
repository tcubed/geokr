import os
import random
from datetime import datetime, timedelta
from itertools import cycle

#from datetime import timedelta
from flask import (Blueprint, render_template, redirect, request, jsonify, 
                   url_for,session,
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
@login_required
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
    # Show games whose start date is no older than yesterday
    yesterday = datetime.utcnow() - timedelta(days=1)
    games = Game.query.filter(Game.start_time >= yesterday).all()
    return render_template('index.html', games=games)

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

    #return render_template('main.html', team=team, game=game,actions=actions)
    # 🧠 Fetch the locations assigned to this team
    assignments = TeamLocationAssignment.query.filter_by(team_id=team.id).all()
    locations = [assignment.location for assignment in assignments]
    
    return render_template("findloc.html", game=game, locations=locations)
# @main_bp.route('/')
# def index():
#     print("Rendering index.html")
#     game = Game.query.first()  # or however you get the current game
#     return render_template('index.html', game=game)

@main_bp.route('/joingame', methods=['GET', 'POST'])
@login_required
def join_game():
    # Show games that are active
    #yesterday = datetime.utcnow() - timedelta(days=1)
    #games = Game.query.filter(Game.start_time >= yesterday).all()

    now = datetime.utcnow()
    games = Game.query.filter(
        or_(
            Game.mode == 'open',
            and_(
                Game.mode == 'competitive',
                or_(Game.join_deadline == None, Game.join_deadline >= now)
            )
        )
    ).all()

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

        # Check if user is already a member of any team in this game
        existing_membership = (
            db.session.query(TeamMembership)
            .join(Team)
            .filter(TeamMembership.user_id == current_user.id)
            .filter(Team.game_id == game_id)
            .first()
        )

        if team_id:  # Join existing team
            # If user is already a member of this team, redirect
            already_on_team = (
                TeamMembership.query.filter_by(user_id=current_user.id, team_id=team_id).first()
            )
            if already_on_team:
                flash("You are already a member of this team.", "info")
                return redirect(url_for('main.main_page'))
            # If user is on a different team in this game, prevent joining another
            if existing_membership:
                flash("You are already on a team for this game.", "warning")
                return redirect(url_for('main.main_page'))
            # Otherwise, add membership
            membership = TeamMembership(user_id=current_user.id, team_id=team_id)
            session['active_team_id'] = membership.team_id
            db.session.add(membership)
            db.session.commit()
            return redirect(url_for('main.main_page'))
    
        elif new_team_name:  # Create new team
            # If user is already on a team in this game, prevent creating another
            if existing_membership:
                flash("You are already on a team for this game.", "warning")
                return redirect(url_for('main.main_page'))
            # Create new team and membership
            team = Team(name=new_team_name, game_id=game_id)
            db.session.add(team)
            db.session.commit()
            membership = TeamMembership(user_id=current_user.id, team_id=team.id, role='captain')
            session['active_team_id'] = membership.team_id
            db.session.add(membership)
            db.session.commit()
            return redirect(url_for('main.main_page'))

    return render_template('joingame.html', games=games, teams_by_game=teams_by_game)

@main_bp.route('/switch_team/<int:team_id>')
@login_required
def switch_team(team_id):
    membership = TeamMembership.query.filter_by(user_id=current_user.id, team_id=team_id).first()
    if not membership:
        flash("You are not a member of that team.", "danger")
        return redirect(url_for('main.main_page'))

    session['active_team_id'] = team_id
    flash("Switched to new team/game.", "success")

    game = membership.team.game
    gametype_name = (game.gametype.name.lower() if game and game.gametype else None)

    if gametype_name == 'navigation':
        return redirect(url_for('main.main_page', #game_id=game.id
                                ))
    elif gametype_name == 'findloc':
        return redirect(url_for('main.findloc', #game_id=game.id
                                ))
    else:
        flash("Unsupported or undefined game type.", "warning")
        return redirect(url_for('main.main_page'))

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
        #db.session.commit()

        # Assign "user" role
        user_role = Role.query.filter_by(name="user").first()
        if not user_role:
            user_role = Role(name="user", description="Standard user")
            db.session.add(user_role)
            #db.session.commit()
        db.session.add(UserRole(user_id=user.id, role_id=user_role.id))
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
        db.session.commit()

        flash('New pin added!', 'success')
        return redirect(url_for('main.main_page'))
    return render_template('game/new_pin.html', lat=lat, lon=lon)


@main_bp.route('/location/<int:location_id>')
@login_required
def location(location_id):
    location = Location.query.get_or_404(location_id)
    return render_template('game/location.html', location=location)



import random
from itertools import cycle

def assign_locations_to_teams(game_id):
    game = Game.query.get(game_id)
    if not game:
        raise ValueError(f"Game with ID {game_id} not found.")

    teams = Team.query.filter_by(game_id=game_id).all()

    # Check if 'routes' is defined in game.data
    routes = None
    num_locations_per_team=5
    if game.data and isinstance(game.data, dict):
        routes = game.data.get('routes')
        num_locations_per_team = game.data.get('num_locations_per_team', num_locations_per_team)
    

    if routes and isinstance(routes, list) and all(isinstance(r, list) for r in routes):
        # Assign based on predefined routes
        route_cycle = cycle(routes)  # Cycle through routes if there are more teams than routes
        for team in teams:
            route = next(route_cycle)
            for loc_id in route:
                assignment = TeamLocationAssignment(
                    team_id=team.id,
                    location_id=loc_id,
                    game_id=game_id
                )
                db.session.add(assignment)
    else:
        # Fallback: Random assignment
        all_location_ids = [loc.id for loc in Location.query.filter_by(game_id=game_id).all()]
        for team in teams:
            assigned = random.sample(all_location_ids, min(num_locations_per_team, len(all_location_ids)))
            for loc_id in assigned:
                assignment = TeamLocationAssignment(
                    team_id=team.id,
                    location_id=loc_id,
                    game_id=game_id
                )
                db.session.add(assignment)

    db.session.commit()


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