from app import db
from app.models import Role, User, UserRole


def _login_existing_user(client, email, display_name):
    return client.post(
        '/register_or_login',
        data={'email': email, 'display_name': display_name},
        follow_redirects=False,
    )


def _build_mapper_client(app, client):
    with app.app_context():
        mapper_role = Role.query.filter_by(name='mapper').first()
        if mapper_role is None:
            mapper_role = Role(name='mapper', description='Mapper')
            db.session.add(mapper_role)
            db.session.flush()

        mapper_user = User.query.filter_by(email='mapper@test.com').first()
        if mapper_user is None:
            mapper_user = User(email='mapper@test.com', display_name='Mapper User')
            db.session.add(mapper_user)
            db.session.flush()

        has_mapper_role = UserRole.query.filter_by(
            user_id=mapper_user.id,
            role_id=mapper_role.id,
        ).first()
        if has_mapper_role is None:
            db.session.add(UserRole(user_id=mapper_user.id, role_id=mapper_role.id))

        db.session.commit()

    login_response = _login_existing_user(client, 'mapper@test.com', 'Mapper User')
    assert login_response.status_code in (301, 302)

    return client


def test_faq_hides_mapper_and_admin_sections_for_regular_users(user_client):
    rv = user_client.get('/faq')
    assert rv.status_code == 200
    assert b'Mapper tips: adding locations to a game' not in rv.data
    assert b'Admin tools and troubleshooting' not in rv.data


def test_faq_shows_mapper_section_for_mapper_role(app, client):
    mapper_client = _build_mapper_client(app, client)

    rv = mapper_client.get('/faq')
    assert rv.status_code == 200
    assert b'Mapper tips: adding locations to a game' in rv.data
    assert b'Admin tools and troubleshooting' not in rv.data

    mapper_client.get('/logout', follow_redirects=False)


def test_faq_shows_mapper_and_admin_sections_for_admins(client):
    login_response = _login_existing_user(client, 'admin@test.com', 'Admin User')
    assert login_response.status_code in (301, 302)

    rv = client.get('/faq')
    assert rv.status_code == 200
    assert b'Mapper tips: adding locations to a game' in rv.data
    assert b'Admin tools and troubleshooting' in rv.data

    client.get('/logout', follow_redirects=False)