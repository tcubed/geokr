@echo off
echo Activating virtual environment...
call venv\Scripts\activate

echo Starting Flask app in debug mode...
set FLASK_APP=run.py
set FLASK_DEBUG=1
rem flask run
python -m flask run