# You can put this in a common module imported by both your API and admin code
from datetime import datetime

# Simple in-memory tombstone cache for deleted records
# Each entry: (team_id, location_id, game_id) -> deletion timestamp
deleted_tombstones = {}  # (team_id, location_id, game_id) -> timestamp

def cleanup_tombstones(expire_seconds=3600):
    now = datetime.utcnow()
    for key, ts in list(deleted_tombstones.items()):
        if (now - ts).total_seconds() > expire_seconds:
            del deleted_tombstones[key]
