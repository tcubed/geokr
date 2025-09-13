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

def create_app():
    app = Flask(__name__)
    
    print(f"Template folder: {app.template_folder}")
    app.config['VERSION'] = str(int(time.time()))  # or use a static number for production
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///game.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False


    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # or 'Strict'
    app.config['REMEMBER_COOKIE_HTTPONLY'] = True
    app.config['REMEMBER_COOKIE_DURATION'] = timedelta(days=365)
    app.config['SESSION_COOKIE_SECURE'] = False    # True only in HTTPS
    app.config['REMEMBER_COOKIE_SECURE'] = False           # True in prod HTTPS

    # EMAIL
    app.config['MAIL_SERVER'] = 'smtp.gmail.com'
    app.config['MAIL_PORT'] = 587
    app.config['MAIL_USE_TLS'] = True
    app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
    app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')
    #app.config['MAIL_DEFAULT_SENDER'] = ('My App', os.getenv('MAIL_PASSWORD'))
    app.config['MAIL_DEFAULT_SENDER'] = ('My App', os.getenv('MAIL_USERNAME'))

    # Disable static file caching for development
    # Flask's default is 12 hours (43200 seconds)
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0


    app.secret_key = 'your-secret-ballroom'  # Needed for Flask-Admin

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
    def inject_version():
        return dict(version=app.config['VERSION'])
    # def inject_user():
    #     return dict(current_user=current_user)
    
    @app.after_request
    def add_header(response):
        if app.debug:
            # Disable caching
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
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