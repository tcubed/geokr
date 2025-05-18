from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def create_app():
    app = Flask(__name__)
    print(f"Template folder: {app.template_folder}")
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///game.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.secret_key = 'your-secret-key'  # Needed for Flask-Admin

    db.init_app(app)

    with app.app_context():
        #from . import routes
        #from . import models
        from app.blueprints import register_blueprints
        register_blueprints(app)

        from app.admin.admin_panel import setup_admin
        setup_admin(app)

        db.create_all()

    return app

