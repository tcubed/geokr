from flask import Blueprint

main_bp = Blueprint('main', __name__)

auth_bp = Blueprint("auth", __name__)

from app.main import routes
from app.main import auth