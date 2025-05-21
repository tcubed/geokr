from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView
from app.models import db, Game, Team, Location, Character, User

def setup_admin(app):
    admin = Admin(app, name='GeoKR Admin', template_mode='bootstrap4')
    admin.add_view(ModelView(Game, db.session))
    admin.add_view(ModelView(Team, db.session))
    admin.add_view(ModelView(Location, db.session))
    admin.add_view(ModelView(Character, db.session))
    admin.add_view(ModelView(User, db.session))
