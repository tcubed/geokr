from flask import (Blueprint, render_template, redirect, request, jsonify, 
                   url_for,
                   Response,current_app,flash)

from flask_login import login_required, current_user
from app.models import Team, db

from app.teams import teams_bp

@teams_bp.route('/teams', methods=['GET', 'POST'])
@login_required
def teams():
    if request.method == 'POST':
        name = request.form['team_name']
        if Team.query.filter_by(name=name).first():
            flash('Team name already exists.', 'danger')
        else:
            team = Team(name=name)
            db.session.add(team)
            db.session.commit()
            flash('Team created!', 'success')
            # Optionally, add user to team here
    teams = Team.query.all()
    return render_template('teams.html', teams=teams)

@teams_bp.route('/join_team/<int:team_id>')
@login_required
def join_team(team_id):
    # Implement logic to add current_user to the team
    flash('Joined team!', 'success')
    return redirect(url_for('teams.teams'))