"""
Tests for Sprint 01 config security changes.
"""

from app.config import ProdConfig, DevConfig


def test_prod_session_cookie_secure():
    assert ProdConfig.SESSION_COOKIE_SECURE is True


def test_prod_remember_cookie_secure():
    assert ProdConfig.REMEMBER_COOKIE_SECURE is True


def test_dev_session_cookie_not_forced_secure():
    """Dev config must NOT require HTTPS so local dev still works."""
    assert DevConfig.SESSION_COOKIE_SECURE is False


def test_dev_remember_cookie_not_forced_secure():
    assert DevConfig.REMEMBER_COOKIE_SECURE is False


def test_app_secret_key_not_old_hardcoded_value(app):
    """The old hardcoded app.secret_key override must be gone."""
    assert app.config['SECRET_KEY'] != 'your-secret-ballroom'


def test_app_secret_key_not_bare_default(app):
    """Should not fall back to the BaseConfig placeholder."""
    assert app.config['SECRET_KEY'] != 'default-secret'


def test_app_secret_key_has_minimum_length(app):
    key = app.config.get('SECRET_KEY', '')
    assert len(key) >= 16, "SECRET_KEY should be at least 16 characters"
