from datetime import timedelta
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, current_user
from flask_migrate import Migrate

import logging
import sys

# logging.basicConfig(
#     level=logging.INFO,  # or DEBUG for more detail
#     format='%(asctime)s %(levelname)s %(message)s',
#     handlers=[logging.StreamHandler(sys.stdout)]
# )
# logger = logging.getLogger(__name__)

migrate = Migrate()
db = SQLAlchemy()

login_manager = LoginManager()
login_manager.login_view = 'main.login'  # or your login route

def create_app():
    app = Flask(__name__)
    print(f"Template folder: {app.template_folder}")
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///game.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['REMEMBER_COOKIE_DURATION'] = timedelta(days=365)
    app.secret_key = 'your-secret-key'  # Needed for Flask-Admin

    db.init_app(app)
    migrate.init_app(app, db)
    
    login_manager.init_app(app)

    @app.context_processor
    def inject_user():
        return dict(current_user=current_user)
    
    with app.app_context():
        #from . import routes
        #from . import models
        from app.blueprints import register_blueprints
        register_blueprints(app)

        from app.admin.admin_panel import setup_admin
        setup_admin(app)

        db.create_all()

    
    
    return app


@login_manager.user_loader
def load_user(user_id):
    from app.models import User

    return User.query.get(int(user_id))