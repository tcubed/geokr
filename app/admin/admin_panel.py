from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView
from flask_admin.form import Select2Widget
from wtforms_sqlalchemy.fields import QuerySelectField
from app.models import (db, 
                        User, Role,UserRole,
                        Game, GameType,Location, Character,
                        Team, TeamMembership, TeamLocationAssignment)
                         
                        


# =======================================================
# USER ADMINISTRATION
# =======================================================

class RoleAdmin(ModelView):
    column_list = ('id', 'name', 'description')
    form_columns = ('name', 'description')

class UserRoleAdmin(ModelView):
    column_list = ('id', 'user', 'role')
    form_columns = ('user', 'role')
    form_overrides = dict(
        user=QuerySelectField,
        role=QuerySelectField
    )
    form_args = dict(
        user=dict(
            query_factory=lambda: User.query.all(),
            get_label='display_name',
            allow_blank=False,
            widget=Select2Widget()
        ),
        role=dict(
            query_factory=lambda: Role.query.all(),
            get_label='name',
            allow_blank=False,
            widget=Select2Widget()
        )
    )

# =======================================================
# TEAM ADMINISTRATION
# =======================================================
class TeamAdmin(ModelView):
    column_list = ('id', 'game','name')
    form_columns = ('game','name')
    # form_overrides = dict(
    #     game=QuerySelectField
    # )
    # form_args = dict(
    #     game=dict(
    #         query_factory=lambda: Game.query.all(),
    #         get_label='name',
    #         allow_blank=False,
    #         widget=Select2Widget()
    #     )
    # )

class TeamMembershipAdmin(ModelView):
    column_list = ('id', 'user','team', 'role')
    form_columns = ('user','team', 'role')
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

class TeamLocationAssignmentAdmin(ModelView):
    column_list = ('id', 'team', 'location', 'game', 'found', 'timestamp_found')
    form_columns = ('team', 'location', 'game', 'found', 'timestamp_found')

    column_labels = {
        'team': 'Team',
        'location': 'Location',
        'game': 'Game',
        'found': 'Found?',
        'timestamp_found': 'Time Found'
    }

    # Use searchable dropdowns for foreign key fields
    form_ajax_refs = {
        'team': {
            'fields': ('name',)
        },
        'location': {
            'fields': ('name',)
        },
        'game': {
            'fields': ('name',)
        }
    }

# =======================================================
# GAME ADMINISTRATION
# =======================================================
class GameAdmin(ModelView):
    column_list = ('id', 'name', 'gametype', 'mode', 'start_time',)
    form_columns = ('name', 'description','gametype', 'mode', 'join_deadline','start_time','data')

    # Display gametype.name instead of the object
    column_labels = {
        'gametype': 'Game Type'
    }

    # Use a dropdown/select for gametype in the form
    form_ajax_refs = {
        'gametype': {
            'fields': (GameType.name,)
        }
    }

class GameTypeAdmin(ModelView):
    column_list = ('id', 'name')
    form_columns = ('name',)

class LocationAdmin(ModelView):
    column_list = ('id', 'name', 'game_id', 'latitude', 'longitude', 'image_url','clue_text', 'unlock_condition')
    form_columns = ('name', 'game', 'latitude', 'longitude', 'image_url','clue_text', 'unlock_condition')

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


def setup_admin(app):
    admin = Admin(app, name='GeoKR Admin', template_mode='bootstrap4')
    #admin.add_view(ModelView(Game, db.session))
    #admin.add_view(ModelView(GameType, db.session))

    # ===========USER MANAGEMENT===========
    admin.add_view(ModelView(User, db.session, category="User", name="Users"))

    #admin.add_view(ModelView(Role, db.session))
    admin.add_view(RoleAdmin(Role, db.session, category="User", name="Roles")) 
    #admin.add_view(ModelView(UserRole, db.session))
    admin.add_view(UserRoleAdmin(UserRole, db.session, category="User", name="UserRoles"))

    # ===========TEAM MANAGEMENT===========
    #admin.add_view(ModelView(Team, db.session))
    admin.add_view(TeamAdmin(Team, db.session, category="Team", name="Teams"))
    admin.add_view(TeamMembershipAdmin(TeamMembership, db.session, category="Team", name="Team Membership"))  # <-- Add this line
    admin.add_view(TeamLocationAssignmentAdmin(TeamLocationAssignment, db.session, category="Team", name="Team Location Assignments"))
    
    # ===========GAME MANAGEMENT===========
    admin.add_view(GameAdmin(Game, db.session, category="Game", name="Games"))
    admin.add_view(GameTypeAdmin(GameType, db.session, category="Game", name="Game Types"))
    admin.add_view(LocationAdmin(Location, db.session, category="Game", name="Location"))
    admin.add_view(CharacterAdmin(Character, db.session, category="Game", name="Character")) 
    
