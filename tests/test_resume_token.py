import pytest
from itsdangerous import BadSignature, SignatureExpired



def test_resume_token_round_trip(app):
    from app.main.auth import generate_resume_token, verify_resume_token

    with app.app_context():
        token = generate_resume_token('user@test.com')
        resolved_email = verify_resume_token(token)

    assert resolved_email == 'user@test.com'



def test_resume_token_invalid_rejected(app):
    from app.main.auth import verify_resume_token

    with app.app_context():
        with pytest.raises(BadSignature):
            verify_resume_token('not-a-real-token')



def test_resume_token_expired_rejected(app):
    from app.main.auth import generate_resume_token, verify_resume_token

    with app.app_context():
        token = generate_resume_token('user@test.com')
        with pytest.raises(SignatureExpired):
            verify_resume_token(token, max_age=-1)
