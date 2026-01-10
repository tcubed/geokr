# Geo-Based Team Game – Technical Design Document

**Project Name:** GeoGame

**Author:** Ted Tower

**Date:** 2026-01-10

**Version:** 1.0

---

## 1. Overview

GeoGame is a **location-based team scavenger hunt** designed for mobile and desktop browsers. Its primary goal is to provide a **progressive clue-reveal game** that works **offline-first**, ensuring players can continue to interact with the game even without internet connectivity.

The system is built with:

* **Backend:** Flask, SQLite, Flask-Login, Flask-Migrate, Flask-Admin
* **Frontend:** Modern ES6 JavaScript, IndexedDB, localStorage, Service Workers

---

## 2. Objectives

1. **Offline-first experience:** Players can download the full set of clues and assets, continue to play offline, and sync progress when online.
2. **Progressive clue reveal:** Players uncover clues sequentially, either by manual confirmation or geolocation/QR/image verification.
3. **Team-based gameplay:** Each team’s progress is tracked independently, with all team members able to see progress.
4. **Modular, maintainable frontend:** Separation of UI, offline logic, and game state management.
5. **Scalable backend:** Support multiple simultaneous games and teams with minimal configuration.

---

## 3. Architecture

### 3.1 High-Level Architecture

```
+-------------------+             +----------------------+
|   Client (JS)     |  <------->  |   Flask Backend      |
|-------------------|   HTTPS     |----------------------|
| - Service Worker   |             | - API endpoints      |
| - IndexedDB        |             | - SQLite DB          |
| - localStorage     |             | - Authentication     |
| - DOM / UI logic   |             | - Sync logic         |
+-------------------+             +----------------------+
```

### 3.2 Offline Flow

1. Player loads the game while online.
2. Client fetches:

   * All location data
   * Clue assets (images/audio)
   * Team assignments
3. Client caches data in **IndexedDB**.
4. Player progresses through the game offline:

   * Marks locations as found
   * Actions queued in IndexedDB
5. Once online, queued actions are synced back to the server.

---

## 4. Data Model

### 4.1 Core Entities

| Entity                     | Description                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Game**                   | A unique scavenger hunt instance. Contains multiple teams and locations.                                                     |
| **Team**                   | A group of users competing together.                                                                                         |
| **User**                   | Player of the game. Linked to a team via TeamMembership.                                                                     |
| **Location**               | A physical spot with a clue (text, image, audio).                                                                            |
| **TeamMembership**         | Links a user to a team. Contains `is_active` flag.                                                                           |
| **TeamLocationAssignment** | Tracks which locations are assigned to which teams and whether they have been found. Essential for syncing progress offline. |

---

### 4.2 Database Schema (Flask/SQLAlchemy)

```python
class Game(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String)
    locations = db.relationship('Location', backref='game')

class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String)
    game_id = db.Column(db.Integer, db.ForeignKey('game.id'))
    members = db.relationship('TeamMembership', backref='team')

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String)
    teams = db.relationship('TeamMembership', backref='user')

class TeamMembership(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'))
    is_active = db.Column(db.Boolean, default=True)

class Location(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.Integer, db.ForeignKey('game.id'))
    clue_text = db.Column(db.String)
    clue_image = db.Column(db.String, nullable=True)
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)

class TeamLocationAssignment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'))
    location_id = db.Column(db.Integer, db.ForeignKey('location.id'))
    found = db.Column(db.Boolean, default=False)
    found_by_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    timestamp = db.Column(db.DateTime, nullable=True)
```

---

## 5. Backend Design

### 5.1 Flask App Structure

```
/app
  /api
    __init__.py
    game_routes.py   # Fetch clues, mark locations found
    sync_routes.py   # Offline sync endpoints
  /models
    __init__.py
    game_models.py
  /admin
    admin_views.py
  run.py
```

### 5.2 API Endpoints

| Endpoint                                 | Method | Description                                                 |
| ---------------------------------------- | ------ | ----------------------------------------------------------- |
| `/api/game/<id>/clues`                   | GET    | Returns all clues and team assignments for offline caching. |
| `/api/team/<id>/location/<loc_id>/found` | POST   | Mark a location as found by a team member.                  |
| `/api/sync`                              | POST   | Sync queued offline actions back to server.                 |
| `/api/status`                            | GET    | Check server status for connectivity check.                 |

---

## 6. Frontend Design

### 6.1 File Structure

```
/static/js
  app-init.js        # Orchestration and app startup
  findloc.js         # Core game logic & UI updates
  offline-db.js      # IndexedDB initialization and CRUD
  offline-sync.js    # Queued action sync with server
  localStorage.js    # Quick state caching
  utils.js           # Helper functions (e.g., date formatting, geolocation helpers)
```

### 6.2 Offline-First Strategy

* **IndexedDB:** Stores entire game state, location data, and queued actions.
* **localStorage:** Caches small pieces of state for faster UI updates.
* **Service Worker:** Intercepts fetch requests for assets and API calls, queues updates when offline.

### 6.3 Game Logic Flow

1. **Initialization (`app-init.js`):**

   * Check IndexedDB for saved game state
   * If online, fetch latest game and team data
   * Prefetch clue assets

2. **Clue Reveal (`findloc.js`):**

   * Display only the next clue in sequence
   * Wait for verification:

     * Manual button press
     * Geolocation within radius
     * QR code scan
     * Image match / selfie verification (future extension)

3. **Offline Sync (`offline-sync.js`):**

   * Queue “found” actions in IndexedDB
   * When online, POST to `/api/sync`
   * Update local IndexedDB and frontend UI to reflect server response

---

## 7. Security & Authentication

* **Flask-Login:** Handles user authentication
* **Token-based sync:** Optional CSRF protection for offline sync
* **Access control:** Users can only mark locations for their active team

---

## 8. User Experience Considerations

* Players will see a **progressive reveal of clues**, never all at once
* Offline users receive **full prefetch of assets** at game start
* Responsive UI for mobile and desktop
* Visual indication of **offline vs online** mode
* Team progress synced automatically, with minimal latency

---

## 9. Future Enhancements

* **Alternative verification methods:** QR, image matching, AR hints
* **Push notifications:** Notify teammates when someone finds a clue
* **Advanced offline conflict resolution:** Merge changes when multiple users update the same team data offline
* **Customizable game rules:** Time limits, scoring, hints

---

## 10. Development Notes

* **Version Control:** Git repository for backend and frontend
* **Virtual Environment:** Conda or venv for Flask backend
* **Frontend Build:** Vanilla ES6 modules; can add bundler (Webpack/Rollup) if project scales
* **Testing:**

  * Unit tests for Flask API
  * Integration tests for offline sync
  * Manual testing for offline-first UX

---

### 11. Summary

This design separates **backend responsibilities** (hydrating and syncing data) from **frontend responsibilities** (gameplay, offline handling, UI updates), creating a robust, offline-first **geo-based team game**. IndexedDB and service workers provide resilience for low-connectivity environments, while modular JavaScript allows maintainable and scalable frontend development.


