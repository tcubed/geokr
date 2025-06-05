from flask import Blueprint

teams_bp = Blueprint('teams', __name__)

from app.teams import routes