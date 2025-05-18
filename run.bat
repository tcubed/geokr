@echo off
echo Activating virtual environment...
call venv\Scripts\activate

echo Starting Flask app...
set FLASK_APP=run.py
set FLASK_ENV=development
flask run
