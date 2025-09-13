import os
from flask import (render_template, redirect, url_for, request, flash, current_app, 
                   jsonify)
from flask_login import login_user, logout_user, login_required,current_user
from flask_mail import Message
from itsdangerous import URLSafeTimedSerializer

from app.models import (db, User,Role,UserRole,)
from app.main import auth_bp
from app import mail


# Serializer for magic link tokens
serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])


# -------------------
# Helper functions
# -------------------
def generate_magic_token(email):
    """Generate a signed token for magic login (15 min expiry)."""
    return serializer.dumps(email, salt='magic-link')

def send_magic_link_email(user):
    """Send the magic login link to the user via email."""
    token = generate_magic_token(user.email)
    magic_link = url_for('auth.magic_login', token=token, _external=True)

    msg = Message(
        subject="Your Magic Login Link",
        #sender=current_app.config.get("MAIL_DEFAULT_SENDER", "ttpilotapp@gmail.com"),
        sender=os.getenv("MAIL_DEFAULT_SENDER", "ttpilotapp@gmail.com"),
        recipients=[user.email],
        body=(
            f"Hello {user.display_name},\n\n"
            f"Click here to log in:\n\n{magic_link}\n\n"
            "This link expires in 15 minutes.\n\n"
            "If you didn't request this, ignore this email."
        )
    )

    try:
        mail.send(msg)
        return True
    except Exception as e:
        current_app.logger.error(f"Error sending magic link to {user.email}: {e}")
        return False

def generate_resume_token(email):
    """Generate a long-lived signed token (30 days) for offline resume."""
    return serializer.dumps(email, salt="resume-token")


def verify_resume_token(token, max_age=2592000):  # 30 days
    """Verify resume token (default 30 days)."""
    return serializer.loads(token, salt="resume-token", max_age=max_age)



def assign_user_role(user):
    """Assign the default 'user' role to a newly registered user."""
    role = Role.query.filter_by(name="user").first()
    if not role:
        role = Role(name="user", description="Standard user")
        db.session.add(role)
        db.session.commit()

    user_role = UserRole(user_id=user.id, role_id=role.id)
    db.session.add(user_role)
    db.session.commit()


# -------------------
# Routes
# -------------------
@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form.get('email')
        display_name = request.form.get('display_name')

        if not email or not display_name:
            flash("Please provide both email and display name.", "warning")
            return redirect(url_for('auth.register'))

        if User.query.filter_by(email=email).first():
            flash('Email already registered.', 'danger')
            return redirect(url_for('auth.register'))

        user = User(email=email, display_name=display_name)
        db.session.add(user)
        db.session.commit()

        assign_user_role(user)

        flash('Registration successful. Please log in via magic link.', 'success')
        return redirect(url_for('auth.login'))

    return render_template('user/register.html')


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email') or request.json.get('email')
        if not email:
            msg = "Please enter your email."
            if request.is_json:
                return jsonify(success=False, message=msg)
            flash(msg, "warning")
            return redirect(url_for('auth.login'))

        user = User.query.filter_by(email=email.lower().strip()).first()
        current_app.logger.debug(f"Login attempt: email={email}, user_found={bool(user)}")

        if not user:
            msg = "Email not found."
            current_app.logger.info(f"Login failed: {email} not found")
            if request.is_json:
                return jsonify(success=False, message=msg)
            flash(msg, "danger")
            current_app.logger.info(f"Login failed: {email} not found")
            return redirect(url_for('auth.login'))

        if send_magic_link_email(user):
            msg = "Magic login link sent to your email."
            current_app.logger.info(f"Magic link sent to: {email}")
            if request.is_json:
                return jsonify(success=True, message=msg)
            flash(msg, "success")
        else:
            msg = "Failed to send email. Please try again later."
            current_app.logger.warning(f"Failed to send magic link to: {email}")
            if request.is_json:
                return jsonify(success=False, message=msg)
            flash(msg, "danger")

        if not request.is_json:
            return redirect(url_for('auth.login'))

    return render_template('user/login.html')


@auth_bp.route('/register_or_login', methods=['GET', 'POST'])
def register_or_login():
    if request.method == 'POST':
        # Check for JSON data first (from fetch requests)
        if request.is_json:
            data = request.json
            email = data.get('email', '').lower().strip()
            display_name = data.get('display_name', '')
        else:
            email = request.form.get('email', '').lower().strip()
            display_name = request.form.get('display_name', '')

        if not email or not display_name:
            msg = "Please provide both email and display name."
            if request.is_json:
                return jsonify(success=False, message=msg)
            flash(msg, "warning")
            return redirect(url_for('auth.register_or_login'))

        # Check for existing user
        user = User.query.filter_by(email=email).first()

        if not user:
            user = User(email=email, display_name=display_name)
            db.session.add(user)
            db.session.commit()
            assign_user_role(user)
            
        login_user(user, remember=True)
        
        # This part of your code seems to be using an old magic-link flow
        # It should be updated to return a JSON response if the request was a fetch
        if request.is_json:
            return jsonify(success=True, message=f"Welcome, {user.display_name}! Login successful.")
        else:
            flash(f"Welcome back, {user.display_name}!", "success")
            return redirect(url_for("main.findloc"))
        
        # # Generate and store a long-lived token
        # resume_token = generate_resume_token(user.email)
        
        # # Serve a page that stores the token and redirects
        # return render_template("user/magic_success.html", 
        #                        resume_token=resume_token,
        #                        display_name=user.display_name)
    
    # For GET requests, show the combined form
    return render_template('user/login.html')

# @auth_bp.route('/login_leg2', methods=['GET', 'POST'])
# def login_leg2():
#     if request.method == 'POST':
#         email = request.form.get('email')
#         if not email:
#             flash("Please enter your email.", "warning")
#             return redirect(url_for('auth.login'))

#         user = User.query.filter_by(email=email.lower().strip()).first()
#         current_app.logger.debug(f"Login attempt: email={email}, user_found={bool(user)}")
#         if not user:
#             flash("Email not found.", "danger")
#             current_app.logger.info(f"Login failed: {email} not found")
#             return redirect(url_for('auth.login'))

#         if send_magic_link_email(user):
#             flash('Magic login link sent to your email.', 'success')
#             current_app.logger.info(f"Magic link sent to: {email}")
#         else:
#             flash('Failed to send email. Please try again later.', 'danger')
#             current_app.logger.warning(f"Failed to send magic link to: {email}")

#         return redirect(url_for('auth.login'))

#     return render_template('user/login.html')


@auth_bp.route("/magic-login")
def magic_login():
    token = request.args.get("token")
    if not token:
        flash("Missing login token.", "danger")
        return redirect(url_for("auth.login"))

    try:
        email = serializer.loads(token, salt="magic-link", max_age=900)
    except Exception:
        flash("Invalid or expired magic link.", "danger")
        return redirect(url_for("auth.login"))

    user = User.query.filter_by(email=email).first()
    if not user:
        flash("No account found for this email.", "danger")
        return redirect(url_for("auth.register"))

    login_user(user, remember=True)
    flash(f"Welcome back, {user.display_name}!", "success")
    #return redirect(url_for("main.account"))
    return redirect(url_for("main.findloc"))

    # Generate persistent resume token
    resume_token = generate_resume_token(user.email)

    # Serve a minimal page that stores token in localStorage and redirects
    return render_template("user/magic_success.html",
                           resume_token=resume_token,
                           display_name=user.display_name)


@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Logged out.', 'success')
    return redirect(url_for('auth.register_or_login'))


# =============================================
#                 LEGACY
# from werkzeug.security import generate_password_hash, check_password_hash


# @main_bp.route('/register_legacy', methods=['GET', 'POST'])
# def register_legacy():
#     if request.method == 'POST':
#         email = request.form['email']
#         display_name = request.form['display_name']
#         password = request.form['password']
#         if User.query.filter_by(email=email).first():
#             flash('Email already registered.', 'danger')
#             return redirect(url_for('main.register'))
#         user = User(email=email, display_name=display_name,
#                     password_hash=generate_password_hash(password))
#         db.session.add(user)
#         #db.session.commit()

#         # Assign "user" role
#         user_role = Role.query.filter_by(name="user").first()
#         if not user_role:
#             user_role = Role(name="user", description="Standard user")
#             db.session.add(user_role)
#             #db.session.commit()
#         db.session.add(UserRole(user_id=user.id, role_id=user_role.id))
#         db.session.commit()

#         flash('Registration successful. Please log in.', 'success')
#         return redirect(url_for('main.login'))
#     return render_template('user/register.html')

# @main_bp.route('/login_legacy', methods=['GET', 'POST'])
# def login_legacy():
#     if request.method == 'POST':
#         email = request.form['email']
#         password = request.form['password']
#         user = User.query.filter_by(email=email).first()
#         if user and check_password_hash(user.password_hash, password):
#             login_user(user,remember=True)
#             flash('Logged in successfully.', 'success')
#             return redirect(url_for('main.account'))
#         flash('Invalid credentials.', 'danger')
#     return render_template('user/login.html')