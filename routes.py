from flask import (current_app as app, render_template, request, jsonify, 
                   Response)
from .models import Location, Character
import math

from app import utils

from functools import wraps


