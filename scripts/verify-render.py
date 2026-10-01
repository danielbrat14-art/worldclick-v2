"""Offline integration checks. Real Supabase/RLS and Google require configuration."""
import base64
import hashlib
import os
import sys
import time
import uuid
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.update(APP_BASE_URL='https://worldclick.onrender.com',
                  SUPABASE_URL='https://example.supabase.co',
                  SUPABASE_PUBLISHABLE_KEY='sb_publishable_test', SECRET_KEY='test-' + 's' * 48)
from app import app
from public_fetch import validate_public_url

app.testing = True
app.config.update(SERVER_NAME='worldclick.onrender.com', PREFERRED_URL_SCHEME='https')
USER_A, USER_B = str(uuid.uuid4()), str(uuid.uuid4())
users = {'access-A': USER_A, 'access-B': USER_B}
words, calls = {}, []

class Response:
    def __init__(self, data, status=200):
        self.data, self.status_code, self.ok = data, status, status < 400
        self.content = b'data' if data is not None else b''
    def json(self):
        return self.data

def provider(method, url, **options):
    calls.append((method, url, options))
    params = options.get('params') or {}
    token = options['headers'].get('Authorization', '').replace('Bearer ', '')
    if '/auth/v1/token' in url:
        code = options['json'].get('auth_code')
        if code == 'fail':
            return Response({}, 401)
        return Response({'access_token': 'access-B' if code == 'B' else 'access-A',
                         'refresh_token': 'refresh-A', 'expires_in': 3600})
    if url.endswith('/auth/v1/user'):
        if token not in users:
            return Response({}, 401)
        return Response({'id': users[token], 'email': token + '@example.test',
                         'email_confirmed_at': '2026-10-01T00:00:00Z',
                         'user_metadata': {'id': USER_B, 'role': 'admin'}})
    if '/auth/v1/logout' in url:
        return Response(None)
    owner = users.get(token)
    assert owner, 'Data API requires a verified bearer token'
    if url.endswith('/rpc/wordclick_save_vocabulary'):
        data = options['json']
        assert 'p_user_id' not in data
        key = (owner, data['p_word_key'])
        old = words.get(key)
        row = {'id': old['id'] if old else str(uuid.uuid4()),
               'payload': {**(old['payload'] if old else {}), **data['p_payload']}}
        words[key] = row
        return Response([row])
    assert params['user_id'] == 'eq.' + owner, 'Server must scope reads/deletes to verified owner'
    matching = [(key, row) for key, row in words.items() if key[0] == owner
                and ('id' not in params or params['id'] == 'eq.' + row['id'])]
    if method == 'GET':
        return Response([row for _, row in matching])
    if method == 'DELETE':
        for key, _ in matching:
            del words[key]
        return Response(None)
    raise AssertionError((method, url))

count = 0
def check(condition, label):
    global count
    assert condition, label
    count += 1
    print('PASS ' + label)

def sign_in(client, code):
    start = client.get('/auth/google?next=https://attacker.test/', base_url='https://worldclick.onrender.com')
    query = parse_qs(urlparse(start.location).query)
    with client.session_transaction() as session:
        verifier = session['pkce']['verifier']
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    check(query['provider'] == ['google'] and query['code_challenge'] == [challenge]
          and query['code_challenge_method'] == ['s256'], 'Google flow binds auth code to browser PKCE verifier')
    check(query['redirect_to'] == ['https://worldclick.onrender.com/auth/callback'], 'callback URL ignores caller next/Host values')
    callback = client.get('/auth/callback?code=' + code, base_url='https://worldclick.onrender.com')
    check(callback.status_code == 302 and callback.location == '/', 'successful callback returns to news home')
    cookie = callback.headers.get('Set-Cookie', '')
    check('Secure' in cookie and 'HttpOnly' in cookie and 'SameSite=Lax' in cookie, 'session cookie is Secure, HttpOnly and SameSite')
    me = client.get('/api/me').get_json()
    check('access_token' not in str(me) and 'refresh_token' not in str(me), 'account API never exposes session tokens')
    return {'X-CSRF-Token': me['auth']['csrf_token']}

with patch('render_accounts.requests.request', provider):
    a, b, guest = app.test_client(), app.test_client(), app.test_client()
    home = guest.get('/')
    check(home.status_code == 200 and b'id="mode-news" class="card mode-panel active"' in home.data, 'public Render home starts at news feed')
    me = guest.get('/api/me', headers={'oai-authenticated-user-id': USER_A,
                                      'oai-authenticated-user-email': 'forged@test'}).get_json()
    check(me['user'] is None and me['auth']['provider'] == 'Google', 'Render ignores forged Sites identity headers')
    for method in ('get', 'post', 'delete'):
        check(getattr(guest, method)('/api/vocabulary', json={} if method == 'post' else None).status_code == 401, 'guest cannot ' + method + ' vocabulary')
    check(guest.get('/auth/callback?code=A').status_code == 401, 'callback without browser verifier is rejected')
    headers_a = sign_in(a, 'A')
    headers_b = sign_in(b, 'B')
    check(a.post('/api/vocabulary', json={'word': 'risk', 'translation': 'ryzyko'}).status_code == 403, 'writes without CSRF proof are rejected')
    check(a.post('/api/vocabulary', json={}, headers={**headers_a, 'Origin': 'https://attacker.test'}).status_code == 403, 'cross-origin writes are rejected')
    saved = a.post('/api/vocabulary', headers=headers_a, json={'word': 'risk', 'translation': 'ryzyko', 'user_id': USER_B}).get_json()['item']
    check(len(a.get('/api/vocabulary').get_json()['items']) == 1, 'verified account can save and read its word')
    check(b.get('/api/vocabulary').get_json()['items'] == [], 'another account cannot read the saved word')
    check(b.delete('/api/vocabulary/' + saved['id'], headers=headers_b).status_code == 404, 'another account cannot delete the word by ID')
    a.post('/api/vocabulary', headers=headers_a, json={'word': 'risk', 'translation': 'ryzyko', 'repetitions': 2, 'interval': 3})
    updated = a.post('/api/vocabulary', headers=headers_a, json={'word': 'risk', 'translation': 'zagrożenie'}).get_json()['item']
    check(updated['id'] == saved['id'] and updated['repetitions'] == 2, 'RPC response preserves stable ID and study progress')
    b.post('/api/vocabulary', headers=headers_b, json={'word': 'risk', 'translation': 'ryzyko B'})
    a.delete('/api/vocabulary', headers=headers_a)
    check(len(b.get('/api/vocabulary').get_json()['items']) == 1, 'clearing one library preserves another account')
    with a.session_transaction() as session:
        session['tokens']['expires_at'] = 0
        session.modified = True
    check(a.get('/api/me').get_json()['user']['email'] == 'access-A@example.test', 'expired session refreshes and verifies identity')
    check(any((call[2].get('params') or {}).get('grant_type') == 'refresh_token' for call in calls), 'refresh uses provider token flow')
    repeated = 'We roll out the product and carry out the tests.'
    with patch('app.requests.get', side_effect=AssertionError('preprocessing must not call cloud translation')):
        lookup = guest.post('/api/translate', json={'word': 'out', 'sentence': repeated,
                            'word_offset': repeated.rindex('out'), 'prefer_browser': True}).get_json()
    check(lookup['phrase'] == 'carry out' and lookup['target_start'] == repeated.index('carry'), 'Render preserves exact contextual phrase preprocessing')
    check(a.get('/auth/logout').status_code in (404, 405), 'GET cannot change login state')
    headers_a = {'X-CSRF-Token': a.get('/api/me').get_json()['auth']['csrf_token']}
    check(a.post('/auth/logout', json={}, headers=headers_a).status_code == 200 and a.get('/api/me').get_json()['user'] is None, 'logout clears the local session')
    with b.session_transaction() as session:
        session['tokens']['access'] = 'invalid'
        session.modified = True
    check(b.get('/api/vocabulary').status_code == 401, 'invalid token cannot read data and clears session')
    check(home.headers['Cache-Control'] == 'private, no-store', 'personalized responses cannot enter shared caches')
    with patch('public_fetch.socket.getaddrinfo', return_value=[(0, 0, 0, '', ('127.0.0.1', 443))]):
        try:
            validate_public_url('https://example.test/')
            raise AssertionError('private resolved IP was allowed')
        except ValueError:
            check(True, 'article import rejects hostnames resolving to private IPs')

print(f'Verified {count} Render auth/API checks with a mocked provider. Live OAuth and RLS verification is pending.')
