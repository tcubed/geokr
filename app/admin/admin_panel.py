from datetime import datetime

from flask_login import current_user
from flask import redirect, url_for, request
from flask_admin import Admin, expose
from flask_admin.contrib.sqla import ModelView
from flask_admin.form import Select2Widget
from wtforms_sqlalchemy.fields import QuerySelectField
from app.models import (db, 
                        User, Role,UserRole,
                        Game, GameType,Location, Character,
                        Team, TeamMembership, TeamLocationAssignment)
                         
class AdminModelView(ModelView):
    def is_accessible(self):
        return current_user.is_authenticated and current_user.is_admin

    def inaccessible_callback(self, name, **kwargs):
        # Redirect to login page or home if user lacks access
        return redirect(url_for('main.index', next=request.url))

# =======================================================
# USER ADMINISTRATION
# =======================================================

class RoleAdmin(AdminModelView):
    column_list = ('id', 'name', 'description')
    form_columns = ('name', 'description')

class UserRoleAdmin(AdminModelView):
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
class TeamAdmin(AdminModelView):
    column_list = (
        'id',              # team_id
        'name',            # team_name
        'game',            # game_name (relationship)
        'game_id',         # game_id
        'start_time',
        'end_time',
        'completion_time',
        'discoverable',
        'num_members'
    )

    # Optional: labels for clarity
    column_labels = {
        'id': 'Team ID',
        'name': 'Team Name',
        'game': 'Game Name',
        'game_id': 'Game ID',
        'start_time': 'Start Time',
        'end_time': 'End Time',
        'completion_time': 'Elapsed',
        'discoverable': 'Discoverable',
        'num_members': 'Members'
    }

    column_formatters = {
        'completion_time': lambda v, c, m, p: (
            str(m.end_time - m.start_time) if m.start_time and m.end_time else ''
        ),
        'num_members': lambda v, c, m, p: len(m.memberships)
    }

    form_columns = (
        'game', 
        'name', 
        'start_time', 
        'end_time', 
        'discoverable', 
        'memberships',
        'data'
    )

    # form_widget_args = {
    #     'start_time': {'readonly': True},
    #     'end_time': {'readonly': True},
    # }


class TeamMembershipAdmin(AdminModelView):
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

class TeamLocationAssignmentAdmin(AdminModelView):
    column_list = ('id', 'team', 'location', 'location.id','game', 'found', 'timestamp_found','order_index')
    column_labels = {
        'team': 'Team',
        'location': 'Location',
        'location.id': 'Location ID',
        'game': 'Game',
        'found': 'Found?',
        'timestamp_found': 'Time Found',
        'order_index':'Order'
    }

    form_columns = ('team', 'location', 'game', 'found', 'timestamp_found','order_index')

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

    def on_model_delete(self, model):
        """
        Called whenever a TeamLocationAssignment is deleted from the admin panel.
        """
        from app.main.cache import deleted_tombstones, cleanup_tombstones

        cleanup_tombstones()  # remove old entries

        key = (model.team_id, model.location_id, model.game_id)
        deleted_tombstones[key] = datetime.utcnow()

# =======================================================
# GAME ADMINISTRATION
# =======================================================
class GameAdmin(AdminModelView):
    column_list = ('id', 'name', 'gametype', 'discoverable','mode',
                   #'minlat','maxlat','minlon','maxlon',
                   'start_time',)
    form_columns = ('name', 'description','gametype', 'discoverable', 'mode', 
                    'min_lat','max_lat','min_lon','max_lon',
                    'join_deadline','start_time','data')

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

class GameTypeAdmin(AdminModelView):
    column_list = ('id', 'name')
    form_columns = ('name',)

class LocationAdmin(AdminModelView):
    column_list = ('id', 'name', 'game_id', 
                   #'latitude', 'longitude',
                   'image_url','clue_text', 'show_pin','unlock_condition')
    form_columns = ('name', 'game', 'latitude', 'longitude', 'image_url','clue_text', 'show_pin','unlock_condition')

    form_overrides = dict(game=QuerySelectField)
    form_args = dict(
        game=dict(
            query_factory=lambda: Game.query.all(),
            get_label='name',
            allow_blank=False,
            widget=Select2Widget()
        )
    )

class CharacterAdmin(AdminModelView):
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
    admin.add_view(AdminModelView(User, db.session, category="User", name="Users"))

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
    
