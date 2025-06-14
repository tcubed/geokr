
from . import db
from flask_login import UserMixin
from datetime import datetime

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
    locations = db.relationship('Location', back_populates='game', lazy=True)
    characters = db.relationship('Character', backref='game', lazy=True)
    
    teams = db.relationship('Team', back_populates='game') # <-- FIXED

    # New fields:
    mode = db.Column(db.String(20), default='open')  # 'open' or 'competitive'
    join_deadline = db.Column(db.DateTime, nullable=True)  # Only for competitive games


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

    game = db.relationship('Game', back_populates='locations')  # <-- Add this line

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
    game = db.relationship('Game', back_populates='teams')
    
    def __str__(self):
        return self.name
    
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

