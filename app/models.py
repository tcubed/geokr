
from . import db
from datetime import datetime

team_game = db.Table('team_game',
    db.Column('team_id', db.Integer, db.ForeignKey('team.id'), primary_key=True),
    db.Column('game_id', db.Integer, db.ForeignKey('game.id'), primary_key=True)
)

# --- Models ---
class Game(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    description = db.Column(db.Text)
    locations = db.relationship('Location', backref='game', lazy=True)
    characters = db.relationship('Character', backref='game', lazy=True)
    teams = db.relationship('Team', secondary=team_game, back_populates='games')  # <-- FIXED


class Location(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.Integer, db.ForeignKey('game.id'), nullable=False)
    name = db.Column(db.String(100))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    clue_text = db.Column(db.Text)
    unlock_condition = db.Column(db.String, nullable=True)

class Character(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.Integer, db.ForeignKey('game.id'), nullable=False)
    name = db.Column(db.String(100))
    bio = db.Column(db.Text)
    location_id = db.Column(db.Integer, db.ForeignKey('location.id'))
    location = db.relationship('Location', backref='characters')
    dialogue = db.Column(db.Text)

class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    clues_found = db.Column(db.PickleType, default=list)
    start_time = db.Column(db.DateTime, default=datetime.utcnow)
    games = db.relationship('Game', secondary=team_game, back_populates='teams')
    