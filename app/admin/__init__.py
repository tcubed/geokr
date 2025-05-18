from flask import Blueprint

admin_bp = Blueprint('admin_cust', __name__, url_prefix='/admin')

from app.admin import routes