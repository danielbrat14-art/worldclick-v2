"""Verify Render's entry address cannot forward credentials or execute old writes."""
import os
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
portal = 'https://wordclick-private.danielbrat14.chatgpt.site/'
os.environ['WORDCLICK_CHATGPT_PORTAL_URL'] = portal
from app import app

app.testing = True
client = app.test_client()
with patch('render_accounts.requests.request', side_effect=AssertionError('No account provider call')):
    for path in ('/', '/?next=https://attacker.test/', '/auth/google', '/auth/callback?code=private-code'):
        response = client.get(path, headers={'oai-authenticated-user-id': 'forged'})
        assert response.status_code == 302 and response.location == portal
    for method, path in (('post', '/api/vocabulary'), ('delete', '/api/vocabulary'),
                         ('post', '/api/translate'), ('post', '/auth/logout')):
        response = getattr(client, method)(path, json={'word': 'private-text'})
        assert response.status_code == 410 and response.get_json()['portal_url'] == portal
    response = client.get('/healthz')
    assert response.status_code == 200 and response.get_json()['ok'] is True

print('PASS Render opens the fixed ChatGPT portal without forwarding callback codes or identity headers')
print('PASS old mutation APIs cannot save, translate or log out through the unused account adapter')
print('PASS Render health check remains available')
