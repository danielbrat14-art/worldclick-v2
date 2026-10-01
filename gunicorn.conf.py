"""Render's existing `gunicorn app:app` start command loads this file."""
import os

bind = '0.0.0.0:' + os.getenv('PORT', '10000')
workers = 1
threads = 4
timeout = 60
