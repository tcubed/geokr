
from . import db

from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.ext.mutable import MutableDict

from flask_login import UserMixin
from datetime import datetime
import secrets


def _coerce_positive_int(value, default):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _coerce_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

team_game = db.Table('team_game',
    db.Column('team_id', db.Integer, db.ForeignKey('team.id'), primary_key=True),
    db.Column('game_id', db.Integer, db.ForeignKey('game.id'), primary_key=True)
)

# --- Models ---
class Game(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    start_time = db.Column(db.DateTime, default=datetime.utcnow)
    description = db.Column(db.Text)
    join_deadline = db.Column(db.DateTime, nullable=True)  # Only for competitive games
    mode = db.Column(db.String(20), default='open')  # 'open' or 'competitive'

    gametype_id = db.Column(db.Integer, db.ForeignKey('game_type.id', name='fk_game_gametype_id'), nullable=True)
    discoverable = db.Column(db.String(20), nullable=True, default='public')

    data = db.Column(JSON, nullable=True)           # flexible JSON blob

    min_lat = db.Column(db.Float, nullable=True)
    max_lat = db.Column(db.Float, nullable=True)
    min_lon = db.Column(db.Float, nullable=True)
    max_lon = db.Column(db.Float, nullable=True)

    # relationships
    gametype = db.relationship('GameType', back_populates='games')
    locations = db.relationship('Location', back_populates='game', lazy=True)
    characters = db.relationship('Character', backref='game', lazy=True)
    teams = db.relationship('Team', back_populates='game') # <-- FIXED
    team_location_assignments = db.relationship('TeamLocationAssignment', back_populates='game', cascade='all, delete-orphan')

    def __str__(self):
        return self.name

    def update_bounds_from_locations(self):
        if not self.locations:
            self.min_lat = None
            self.max_lat = None
            self.min_lon = None
            self.max_lon = None
            return

        lats = [loc.latitude for loc in self.locations if loc.latitude is not None]
        lons = [loc.longitude for loc in self.locations if loc.longitude is not None]

        if lats and lons:
            self.min_lat = min(lats)
            self.max_lat = max(lats)
            self.min_lon = min(lons)
            self.max_lon = max(lons)
        else:
            self.min_lat = None
            self.max_lat = None
            self.min_lon = None
            self.max_lon = None

    def get_brand_icon(self):
        """
        Returns (icon_url, alt_text)
        """
        default_icon = 'icons/grd_128a.png'
        default_alt = 'Geo Clue Game'

        if not self.data:
            return default_icon, default_alt

        branding = self.data.get('branding', {})
        icon = branding.get('icon_url', default_icon)
        alt = branding.get('icon_alt', default_alt)

        return icon, alt

    def get_admin_status(self):
        if not self.data or not isinstance(self.data, dict):
            return None

        status = (self.data.get('admin_status') or '').strip().lower()
        if status in {'ready', 'ongoing', 'complete'}:
            return status
        return None

    def set_admin_status(self, status):
        normalized = (status or '').strip().lower()
        if normalized not in {'ready', 'ongoing', 'complete'}:
            normalized = None

        data = dict(self.data or {})
        if normalized:
            data['admin_status'] = normalized
        else:
            data.pop('admin_status', None)

        self.data = data
        return normalized

    def get_qr_config(self):
        if not self.data or not isinstance(self.data, dict):
            return {'enabled': False, 'tokens': {}}

        qr = self.data.get('qr', {}) or {}
        tokens = qr.get('tokens', {}) or {}
        return {
            'enabled': bool(qr.get('enabled')),
            'tokens': {str(location_id): token for location_id, token in tokens.items() if token},
        }

    @property
    def qr_enabled(self):
        return self.get_qr_config().get('enabled', False)

    def set_qr_enabled(self, enabled):
        data = dict(self.data or {})
        qr = dict(data.get('qr', {}) or {})
        qr['enabled'] = bool(enabled)
        qr['tokens'] = {str(location_id): token for location_id, token in (qr.get('tokens', {}) or {}).items() if token}
        data['qr'] = qr
        self.data = data
        return qr['enabled']

    def get_qr_token(self, location_id):
        return self.get_qr_config().get('tokens', {}).get(str(location_id))

    def set_qr_token(self, location_id, token):
        data = dict(self.data or {})
        qr = dict(data.get('qr', {}) or {})
        tokens = {str(loc_id): value for loc_id, value in (qr.get('tokens', {}) or {}).items() if value}
        tokens[str(location_id)] = token
        qr['tokens'] = tokens
        data['qr'] = qr
        self.data = data
        return token

    def ensure_qr_tokens(self, location_ids, token_factory=None):
        data = dict(self.data or {})
        qr = dict(data.get('qr', {}) or {})
        tokens = {str(loc_id): value for loc_id, value in (qr.get('tokens', {}) or {}).items() if value}
        changed = False
        token_factory = token_factory or (lambda: secrets.token_urlsafe(12))

        for location_id in location_ids:
            key = str(location_id)
            if not tokens.get(key):
                tokens[key] = token_factory()
                changed = True

        qr['tokens'] = tokens
        qr['enabled'] = bool(qr.get('enabled'))
        data['qr'] = qr

        if changed or self.data != data:
            self.data = data

        return tokens, changed

    def find_location_id_for_qr_token(self, token):
        raw = (token or '').strip()
        if not raw:
            return None

        if raw.startswith('geokr:qr:'):
            raw = raw.split('geokr:qr:', 1)[1].strip()

        for location_id, location_token in self.get_qr_config().get('tokens', {}).items():
            if raw == location_token:
                try:
                    return int(location_id)
                except (TypeError, ValueError):
                    return None
        return None

    def get_geofence_settings(self):
        defaults = {
            'enabled': False,
            'poll_interval_s': 20,
            'default_cooldown_s': 300,
            'default_repeat_every_s': 180,
        }
        if not self.data or not isinstance(self.data, dict):
            return defaults

        settings = dict(self.data.get('geofence_settings', {}) or {})
        raw_geofences = self.data.get('geofences', {}) or {}

        enabled = settings.get('enabled')
        if enabled is None:
            enabled = bool(raw_geofences)

        return {
            'enabled': bool(enabled),
            'poll_interval_s': _coerce_positive_int(settings.get('poll_interval_s'), defaults['poll_interval_s']),
            'default_cooldown_s': _coerce_positive_int(settings.get('default_cooldown_s'), defaults['default_cooldown_s']),
            'default_repeat_every_s': _coerce_positive_int(settings.get('default_repeat_every_s'), defaults['default_repeat_every_s']),
        }

    def get_geofence_config(self):
        settings = self.get_geofence_settings()
        if not self.data or not isinstance(self.data, dict):
            return {'settings': settings, 'locations': {}}

        raw_locations = self.data.get('geofences', {}) or {}
        normalized_locations = {}

        for location_id, fences in raw_locations.items():
            try:
                location_key = str(int(location_id))
            except (TypeError, ValueError):
                continue

            if not isinstance(fences, list):
                continue

            normalized_fences = []
            for index, fence in enumerate(fences):
                if not isinstance(fence, dict):
                    continue

                shape = (fence.get('shape') or '').strip().lower()
                trigger = (fence.get('trigger') or '').strip().lower()
                repeat_while = fence.get('repeat_while')
                repeat_while = (repeat_while or '').strip().lower() if repeat_while else None

                center = dict(fence.get('center', {}) or {})
                center_lat = _coerce_float(center.get('lat'))
                center_lon = _coerce_float(center.get('lon'))
                radius_m = _coerce_float(fence.get('radius_m'))

                if shape != 'circle':
                    continue
                if trigger not in {'enter', 'exit'}:
                    continue
                if center_lat is None or center_lon is None or radius_m is None or radius_m <= 0:
                    continue

                message = (fence.get('message') or '').strip()
                if not message:
                    continue

                if repeat_while not in {'inside', 'outside'}:
                    repeat_while = None

                normalized_fences.append({
                    'id': str(fence.get('id') or f'location-{location_key}-fence-{index + 1}'),
                    'enabled': bool(fence.get('enabled', True)),
                    'shape': shape,
                    'center': {'lat': center_lat, 'lon': center_lon},
                    'radius_m': radius_m,
                    'trigger': trigger,
                    'message': message,
                    'cooldown_s': _coerce_positive_int(fence.get('cooldown_s'), settings['default_cooldown_s']),
                    'once_per_team': bool(fence.get('once_per_team', False)),
                    'priority': int(fence.get('priority', 0) or 0),
                    'repeat_while': repeat_while,
                    'repeat_every_s': (
                        _coerce_positive_int(fence.get('repeat_every_s'), settings['default_repeat_every_s'])
                        if repeat_while else None
                    ),
                    'metadata': dict(fence.get('metadata', {}) or {}),
                    'location_id': int(location_key),
                })

            if normalized_fences:
                normalized_locations[location_key] = normalized_fences

        return {'settings': settings, 'locations': normalized_locations}

    def get_location_geofences(self, location_id):
        return list(self.get_geofence_config().get('locations', {}).get(str(location_id), []))

    def set_location_geofences(self, location_id, fences):
        data = dict(self.data or {})
        raw_locations = dict(data.get('geofences', {}) or {})
        key = str(location_id)

        cleaned_fences = []
        for fence in fences or []:
            if not isinstance(fence, dict):
                continue
            cleaned_fences.append(dict(fence))

        if cleaned_fences:
            raw_locations[key] = cleaned_fences
        else:
            raw_locations.pop(key, None)

        data['geofences'] = raw_locations
        settings = dict(data.get('geofence_settings', {}) or {})
        settings['enabled'] = bool(raw_locations)
        data['geofence_settings'] = settings
        self.data = data
        return cleaned_fences

    def has_geofences(self):
        config = self.get_geofence_config()
        return bool(config.get('settings', {}).get('enabled')) and any(config.get('locations', {}).values())

class GameType(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)

    games = db.relationship('Game', back_populates='gametype')

    def __str__(self):
        return self.name

class Location(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.Integer, db.ForeignKey('game.id'), nullable=False)
    name = db.Column(db.String(100))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    clue_text = db.Column(db.Text)
    unlock_condition = db.Column(db.String, nullable=True)
    image_url = db.Column(db.String(300), nullable=True) 
    show_pin = db.Column(db.Boolean, nullable=True, default=None)

    game = db.relationship('Game', back_populates='locations')  # <-- Add this line
    team_assignments = db.relationship('TeamLocationAssignment', back_populates='location', cascade='all, delete-orphan')

    def __str__(self):
        return self.name
    
class Character(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.Integer, db.ForeignKey('game.id'), nullable=False)
    name = db.Column(db.String(100))
    bio = db.Column(db.Text)
    location_id = db.Column(db.Integer, db.ForeignKey('location.id'))
    location = db.relationship('Location', backref='characters')
    dialogue = db.Column(db.Text)

    def __str__(self):
        return self.name

class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    game_id = db.Column(db.Integer, db.ForeignKey('game.id'), nullable=False)
    clues_found = db.Column(db.PickleType, default=list)
    start_time = db.Column(db.DateTime, default=datetime.utcnow)
    end_time = db.Column(db.DateTime, nullable=True)  # <-- Add this line
    discoverable = db.Column(db.Boolean, default=True)  # Whether other teams can find/join
    memberships = db.relationship('TeamMembership', back_populates='team', cascade="all, delete-orphan")
    #data = db.Column(JSON, default=lambda: {})
    data = db.Column(MutableDict.as_mutable(db.JSON), default=dict)

    game = db.relationship('Game', back_populates='teams')
    location_assignments = db.relationship('TeamLocationAssignment', back_populates='team', cascade='all, delete-orphan')

    def __str__(self):
        return self.name

    def get_geofence_state(self):
        if not self.data or not isinstance(self.data, dict):
            return {}
        return dict(self.data.get('geofence_state', {}) or {})

    def get_geofence_runtime_state(self):
        if not self.data or not isinstance(self.data, dict):
            return {}
        return dict(self.data.get('geofence_runtime', {}) or {})

    def set_geofence_tracking(self, geofence_state=None, geofence_runtime=None):
        data = dict(self.data or {})
        if geofence_state is not None:
            data['geofence_state'] = dict(geofence_state or {})
        if geofence_runtime is not None:
            data['geofence_runtime'] = dict(geofence_runtime or {})
        self.data = data
        return self.data
    
class User(db.Model,UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    display_name = db.Column(db.String(80))
    email = db.Column(db.String(120), unique=True)
    picture_url = db.Column(db.String(200))
    password_hash = db.Column(db.String(128))  # Add password hash for authentication

    team_memberships = db.relationship('TeamMembership', back_populates='user', cascade="all, delete-orphan")

    user_roles = db.relationship('UserRole', back_populates='user')
    
    def __str__(self):
        return self.display_name
    
    @property
    def is_admin(self):
        return any(ur.role.name == 'admin' for ur in self.user_roles)
        #return self.user_roles.join(Role).filter(Role.name == 'admin').count() > 0

    def has_role(self, role_name):
        return any(ur.role and ur.role.name == role_name for ur in self.user_roles)
    
class TeamMembership(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=False)
    role = db.Column(db.String(20), default='member')  # 'captain' or 'member'
    __table_args__ = (db.UniqueConstraint('user_id', 'team_id', name='_user_team_uc'),
                      #db.UniqueConstraint('user_id', 'game_id', name='_user_game_uc')
                      )
    user = db.relationship('User', back_populates='team_memberships')
    team = db.relationship('Team', back_populates='memberships')
    # Convenience property to get game_id from team
    @property
    def game_id(self):
        return self.team.game_id
    
    def __str__(self):
        # This is what will show up in admin
        return f"{self.user.display_name} ({self.role})"

class TeamLocationAssignment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=False)
    location_id = db.Column(db.Integer, db.ForeignKey('location.id'), nullable=False)
    game_id = db.Column(db.Integer, db.ForeignKey('game.id'), nullable=False)
    order_index=db.Column(db.Integer, nullable=False, default=0)

    # Optional: track completion
    found = db.Column(db.Boolean, default=False)
    timestamp_found = db.Column(db.DateTime)

    __table_args__ = (
        db.UniqueConstraint('team_id', 'location_id', name='_team_location_uc'),
    )

    team = db.relationship('Team', back_populates='location_assignments')
    location = db.relationship('Location', back_populates='team_assignments')
    game = db.relationship('Game', back_populates='team_location_assignments')


class Role(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.String(200))

    user_roles = db.relationship('UserRole', back_populates='role')

    def __str__(self):
        return self.name

class UserRole(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey('role.id'), nullable=False)

    user = db.relationship('User', back_populates='user_roles')
    role = db.relationship('Role', back_populates='user_roles')

    def __str__(self):
        return f"{self.user.display_name} - {self.role.name}"

