"""
Test configuration and shared fixtures.

Prerequisites (install once):
    pip install pytest
"""

import pytest
from app import create_app, db as _db
from app.models import User, Role, UserRole
from app.config import BaseConfig


# ---------------------------------------------------------------------------
# Test config — in-memory SQLite, mail suppressed
# ---------------------------------------------------------------------------

class TestConfig(BaseConfig):
    TESTING = True
    LOGIN_DISABLED = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False
    SECRET_KEY = 'test-secret-key-for-testing-only'
    MAIL_SUPPRESS_SEND = True   # Flask-Mail: suppress actual sends
    DEBUG = False


# ---------------------------------------------------------------------------
# Session-scoped app + database
# ---------------------------------------------------------------------------

@pytest.fixture(scope='session')
def app():
    application = create_app(TestConfig)
    with application.app_context():
        _db.create_all()
        _seed_db()
        yield application
        _db.drop_all()


def _seed_db():
    """Create roles and one regular + one admin user for the whole session."""
    for name, desc in [('user', 'Standard user'), ('admin', 'Administrator')]:
        if not Role.query.filter_by(name=name).first():
            _db.session.add(Role(name=name, description=desc))
    _db.session.commit()

    if not User.query.filter_by(email='user@test.com').first():
        u = User(email='user@test.com', display_name='Test User')
        _db.session.add(u)
        _db.session.flush()
        _db.session.add(UserRole(user_id=u.id,
                                  role_id=Role.query.filter_by(name='user').first().id))

    if not User.query.filter_by(email='admin@test.com').first():
        a = User(email='admin@test.com', display_name='Admin User')
        _db.session.add(a)
        _db.session.flush()
        _db.session.add(UserRole(user_id=a.id,
                                  role_id=Role.query.filter_by(name='admin').first().id))

    _db.session.commit()


# ---------------------------------------------------------------------------
# User ID fixtures (primitive values — no detached-instance issues)
# ---------------------------------------------------------------------------

@pytest.fixture(scope='session')
def regular_user_id(app):
    with app.app_context():
        return User.query.filter_by(email='user@test.com').first().id


@pytest.fixture(scope='session')
def admin_user_id(app):
    with app.app_context():
        return User.query.filter_by(email='admin@test.com').first().id


# ---------------------------------------------------------------------------
# Client fixtures — function-scoped so each test gets a clean session
# ---------------------------------------------------------------------------

@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def user_client(client, regular_user_id):
    """Test client pre-authenticated as a regular (non-admin) user."""
    with client.session_transaction() as sess:
        sess['_user_id'] = str(regular_user_id)
        sess['_fresh'] = True
    return client


@pytest.fixture
def admin_client(client, admin_user_id):
    """Test client pre-authenticated as an admin user."""
    with client.session_transaction() as sess:
        sess['_user_id'] = str(admin_user_id)
        sess['_fresh'] = True
    return client
