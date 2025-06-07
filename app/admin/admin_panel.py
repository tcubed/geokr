from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView
from flask_admin.form import Select2Widget
from wtforms_sqlalchemy.fields import QuerySelectField
from app.models import (db, Game, Team, Location, Character, User, TeamMembership)

class LocationAdmin(ModelView):
    column_list = ('id', 'name', 'game_id', 'latitude', 'longitude', 'clue_text', 'unlock_condition')
    form_columns = ('name', 'game', 'latitude', 'longitude', 'clue_text', 'unlock_condition')

    form_overrides = dict(game=QuerySelectField)
    form_args = dict(
        game=dict(
            query_factory=lambda: Game.query.all(),
            get_label='name',
            allow_blank=False,
            widget=Select2Widget()
        )
    )

class CharacterAdmin(ModelView):
    column_list = ('id', 'name', 'game', 'location', 'bio', 'dialogue')
    form_columns = ('name', 'game', 'location', 'bio', 'dialogue')
    form_overrides = dict(
        game=QuerySelectField,
        location=QuerySelectField
    )
    form_args = dict(
        game=dict(
            query_factory=lambda: Game.query.all(),
            get_label='name',
            allow_blank=False,
            widget=Select2Widget()
        ),
        location=dict(
            query_factory=lambda: Location.query.all(),
            get_label='name',
            allow_blank=True,
            widget=Select2Widget()
        )
    )

class TeamMembershipAdmin(ModelView):
    column_list = ('id', 'user', 'team', 'role')
    form_columns = ('user', 'team', 'role')
    form_overrides = dict(
        user=QuerySelectField,
        team=QuerySelectField
    )
    form_args = dict(
        user=dict(
            query_factory=lambda: User.query.all(),
            get_label='display_name',
            allow_blank=False,
            widget=Select2Widget()
        ),
        team=dict(
            query_factory=lambda: Team.query.all(),
            get_label='name',
            allow_blank=False,
            widget=Select2Widget()
        )
    )



def setup_admin(app):
    admin = Admin(app, name='GeoKR Admin', template_mode='bootstrap4')
    admin.add_view(ModelView(Game, db.session))
    admin.add_view(ModelView(Team, db.session))
    admin.add_view(TeamMembershipAdmin(TeamMembership, db.session))  # <-- Add this line
    #admin.add_view(ModelView(Location, db.session))
    admin.add_view(LocationAdmin(Location, db.session))
    #admin.add_view(ModelView(Character, db.session))
    admin.add_view(CharacterAdmin(Character, db.session)) 
    admin.add_view(ModelView(User, db.session))
