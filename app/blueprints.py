
def register_blueprints(app):
    from app.main import main_bp
    app.register_blueprint(main_bp)

    from app.admin import admin_bp
    app.register_blueprint(admin_bp)

    from app.teams import teams_bp
    app.register_blueprint(teams_bp)

    from app.api import api_bp
    app.register_blueprint(api_bp)