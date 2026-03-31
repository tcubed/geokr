import os
import time
from datetime import timedelta
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, current_user
from flask_migrate import Migrate
from flask_mail import Mail
from dotenv import load_dotenv

import logging
import sys

from app.config import DevConfig

# logging.basicConfig(
#     level=logging.INFO,  # or DEBUG for more detail
#     format='%(asctime)s %(levelname)s %(message)s',
#     handlers=[logging.StreamHandler(sys.stdout)]
# )
# logger = logging.getLogger(__name__)
load_dotenv()
migrate = Migrate()
db = SQLAlchemy()
mail = Mail()  # create Mail instance

login_manager = LoginManager()
login_manager.login_view = 'auth.login'  # or your login route

def create_app(config_class=DevConfig):
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    # IMAGES
    app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'static', 'images', 'uploads')

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    mail.init_app(app)

    @app.context_processor
    def inject_user_flags():
        return {
            'is_admin': current_user.is_authenticated and current_user.is_admin
        }
    
    @app.context_processor
    def inject_globals():
        # ---- version (existing behavior) ----
        context = {
            "version": app.config.get("VERSION", "")
        }

        # ---- optional game branding ----
        brand_icon = "icons/apple-touch-icon.png"
        brand_icon_alt = "Geo Clue Game"
        navbar_color = "#0d6efd"

        from app.main.routes import get_active_team
        try:
            if current_user.is_authenticated:
                team = get_active_team(current_user)
                if team and team.game:
                    game = team.game
                    if game.data:
                        branding = game.data.get("branding", {})
                        brand_icon = branding.get("icon_url", brand_icon)
                        brand_icon_alt = branding.get("icon_alt", brand_icon_alt)
                        navbar_color=branding.get("navbar_color", navbar_color)
        except Exception:
            # Context processors must NEVER break rendering
            pass

        context.update({
            "brand_icon": brand_icon,
            "brand_icon_alt": brand_icon_alt,
            "navbar_color": navbar_color
        })

        return context
    
    @app.after_request
    def add_header(response):
        # if app.debug:
        #     # Disable caching
        #     response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        #     response.headers["Pragma"] = "no-cache"
        #     response.headers["Expires"] = "0"
        return response

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