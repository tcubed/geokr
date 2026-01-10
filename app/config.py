# config.py
import os
from datetime import timedelta

class BaseConfig:
    VERSION = 1 #str(int(time.time()))  # or use a static number for production
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.getenv("SECRET_KEY", "default-secret")
    REMEMBER_COOKIE_DURATION = timedelta(days=365)
    UPLOAD_FOLDER = os.path.join(os.getcwd(), 'static', 'images', 'uploads')
    MAIL_SERVER = 'smtp.gmail.com'
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.getenv('MAIL_USERNAME')
    MAIL_PASSWORD = os.getenv('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = ('My App', os.getenv('MAIL_USERNAME'))

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'  # or 'Strict'
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_DURATION = timedelta(days=365)
    SESSION_COOKIE_SECURE = False    # True only in HTTPS
    REMEMBER_COOKIE_SECURE = False           # True in prod HTTPS

class DevConfig(BaseConfig):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///game.db'

    # Disable static file caching for development
    # Flask's default is 12 hours (43200 seconds)
    SEND_FILE_MAX_AGE_DEFAULT = 0

class ProdConfig(BaseConfig):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///prod.db')



    
