"""Google/Supabase accounts for the Flask app on Render.

Supabase verifies every user and enforces ownership through RLS. A publishable
key is sufficient; no service-role key and no browser token storage are used.
"""
import base64
import hashlib
import hmac
import math
import os
import secrets
import time
import uuid
from datetime import timedelta
from urllib.parse import urlencode, urlparse

import requests
from flask import g, jsonify, redirect, request, session


class AccountError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def register_accounts(app):
    base = os.getenv('APP_BASE_URL', '').rstrip('/')
    project = os.getenv('SUPABASE_URL', '').rstrip('/')
    key = os.getenv('SUPABASE_PUBLISHABLE_KEY', '')
    secret = os.getenv('SECRET_KEY', '')
    local = urlparse(base).hostname in ('localhost', '127.0.0.1')
    base_valid = urlparse(base).scheme == 'https' or (local and base.startswith('http://'))
    configured = bool(base_valid and project.startswith('https://') and key and len(secret) >= 32)
    if key and not key.startswith('sb_publishable_'):
        raise RuntimeError('Use a Supabase publishable key, never a secret key.')
    app.config.update(
        SECRET_KEY=secret or secrets.token_urlsafe(48),
        SESSION_COOKIE_NAME='wordclick_session' if local else '__Host-wordclick_session',
        SESSION_COOKIE_SECURE=not local, SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax', SESSION_COOKIE_PATH='/',
        PERMANENT_SESSION_LIFETIME=timedelta(days=7),
        SESSION_REFRESH_EACH_REQUEST=False, MAX_CONTENT_LENGTH=60000,
    )

    def remote(method, path, *, token=None, data=None, params=None):
        if not configured:
            raise AccountError(503, 'Logowanie Google nie jest jeszcze skonfigurowane.')
        headers = {'apikey': key, 'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        try:
            response = requests.request(method, project + path, headers=headers,
                                        json=data, params=params, timeout=10,
                                        allow_redirects=False)
        except requests.RequestException:
            raise AccountError(503, 'Usługa kont nie odpowiada. Spróbuj ponownie.')
        if not response.ok:
            if response.status_code in (400, 401, 403) and path.startswith('/auth/'):
                raise AccountError(401, 'Sesja wygasła lub logowanie się nie udało. Zaloguj się ponownie.')
            raise AccountError(503, 'Nie udało się wykonać operacji na koncie. Spróbuj ponownie.')
        try:
            return response.json() if response.content else None
        except ValueError:
            raise AccountError(503, 'Usługa kont zwróciła nieprawidłową odpowiedź.')

    def install_tokens(data):
        access, refresh = data.get('access_token'), data.get('refresh_token')
        if not isinstance(access, str) or not isinstance(refresh, str):
            raise AccountError(401, 'Nie udało się utworzyć sesji. Zaloguj się ponownie.')
        expires = data.get('expires_in', 3600)
        if not isinstance(expires, (int, float)) or not 0 < expires <= 86400:
            raise AccountError(401, 'Nieprawidłowy czas sesji.')
        session['tokens'] = {'access': access, 'refresh': refresh, 'expires_at': time.time() + expires}
        session.permanent = True

    def user(required=False):
        if hasattr(g, 'account_user'):
            result = g.account_user
        else:
            result = None
            tokens = session.get('tokens')
            if configured and tokens:
                try:
                    if tokens['expires_at'] < time.time() + 30:
                        install_tokens(remote('POST', '/auth/v1/token',
                                              params={'grant_type': 'refresh_token'},
                                              data={'refresh_token': tokens['refresh']}))
                        tokens = session['tokens']
                    verified = remote('GET', '/auth/v1/user', token=tokens['access'])
                    # This server-verified identity is the only ownership source.
                    # Caller headers, form fields and user_metadata are ignored.
                    identity = str(uuid.UUID(verified['id']))
                    if verified.get('is_anonymous') or not verified.get('email_confirmed_at'):
                        raise AccountError(401, 'Konto wymaga potwierdzonego adresu e-mail.')
                    result = {'id': identity, 'email': verified['email']}
                except AccountError as error:
                    if error.status != 401:
                        raise
                    session.clear()
                except (KeyError, ValueError, TypeError):
                    session.clear()
            g.account_user = result
        if required and not result:
            raise AccountError(401, 'Zaloguj się przez Google, aby korzystać ze swojej biblioteki.')
        return result

    def csrf():
        token = session.get('csrf')
        supplied = request.headers.get('X-CSRF-Token', '')
        if not token or not hmac.compare_digest(token, supplied):
            raise AccountError(403, 'Odśwież stronę i spróbuj ponownie.')

    @app.before_request
    def guard_origin():
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return
        origin = request.headers.get('Origin')
        expected = base if configured else request.host_url.rstrip('/')
        if (origin and origin != expected) or request.headers.get('Sec-Fetch-Site') == 'cross-site':
            raise AccountError(403, 'Niedozwolone źródło żądania.')

    @app.after_request
    def private_responses(response):
        response.headers['Cache-Control'] = 'private, no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; "
            "media-src 'self' https://translate.google.com; connect-src 'self' "
            "https://translate.googleapis.com https://api.mymemory.translated.net; frame-ancestors 'self'"
        )
        return response

    @app.errorhandler(AccountError)
    def account_error(error):
        return jsonify(error=error.message), error.status

    @app.get('/api/me')
    def me():
        current = user()
        if current and 'csrf' not in session:
            session['csrf'] = secrets.token_urlsafe(32)
        return jsonify(user={'email': current['email']} if current else None,
                       storage='account' if current else 'none',
                       auth={'enabled': configured, 'provider': 'Google', 'login_url': '/auth/google',
                             'logout_url': '/auth/logout', 'logout_method': 'POST',
                             'csrf_token': session.get('csrf', '')})

    @app.get('/auth/google')
    def google_login():
        if not configured:
            raise AccountError(503, 'Logowanie Google nie jest jeszcze skonfigurowane.')
        # The callback is fixed by server config, never by a Host/next parameter.
        verifier = secrets.token_urlsafe(64)
        session['pkce'] = {'verifier': verifier, 'created': time.time()}
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
        return redirect(project + '/auth/v1/authorize?' + urlencode({
            'provider': 'google', 'redirect_to': base + '/auth/callback',
            'code_challenge': challenge, 'code_challenge_method': 's256', 'scopes': 'email profile',
        }))

    @app.get('/auth/callback')
    def google_callback():
        flow = session.pop('pkce', None)
        code = request.args.get('code', '')
        if not flow or time.time() - flow.get('created', 0) > 600 or not code or len(code) > 500:
            raise AccountError(401, 'Logowanie wygasło lub zostało anulowane. Spróbuj ponownie.')
        data = remote('POST', '/auth/v1/token', params={'grant_type': 'pkce'},
                      data={'auth_code': code, 'code_verifier': flow['verifier']})
        session.clear()
        install_tokens(data)
        user(required=True)
        session['csrf'] = secrets.token_urlsafe(32)
        return redirect('/')

    @app.post('/auth/logout')
    def logout():
        csrf()
        tokens = session.get('tokens')
        session.clear()
        if tokens:
            try:
                remote('POST', '/auth/v1/logout', token=tokens['access'], params={'scope': 'local'})
            except AccountError:
                pass  # The local cookie is cleared even if the provider is down.
        return jsonify(ok=True)

    def clean(value, limit):
        return value.strip()[:limit] if isinstance(value, str) else ''

    @app.route('/api/vocabulary', methods=['GET', 'POST', 'DELETE'])
    @app.route('/api/vocabulary/<item_id>', methods=['DELETE'])
    def vocabulary(item_id=None):
        current = user(required=True)
        access = session['tokens']['access']
        owner = {'user_id': 'eq.' + current['id']}
        if request.method == 'GET':
            rows = remote('GET', '/rest/v1/wordclick_vocabulary', token=access,
                          params={**owner, 'select': 'id,payload', 'order': 'updated_at.desc'})
            return jsonify(items=[{**row['payload'], 'id': row['id']} for row in rows])
        csrf()
        if request.method == 'DELETE':
            params = owner.copy()
            if item_id:
                try:
                    params['id'] = 'eq.' + str(uuid.UUID(item_id))
                except ValueError:
                    raise AccountError(400, 'Nieprawidłowy wpis.')
                found = remote('GET', '/rest/v1/wordclick_vocabulary', token=access,
                               params={**params, 'select': 'id'})
                if not found:
                    raise AccountError(404, 'Nie znaleziono wpisu na Twoim koncie.')
            remote('DELETE', '/rest/v1/wordclick_vocabulary', token=access, params=params)
            return jsonify(ok=True)
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise AccountError(400, 'Nieprawidłowe dane JSON.')
        word = clean(data.get('phrase') or data.get('word'), 120)
        word_key = clean(data.get('phrase') or data.get('clean_word') or word, 120).lower()
        translation = clean(data.get('translation'), 1000)
        if not word or not word_key or not translation:
            raise AccountError(400, 'Słowo i tłumaczenie są wymagane.')
        payload = {'word': word, 'clean_word': word_key, 'translation': translation,
                   'is_phrase': data.get('is_phrase') is True,
                   'dateAdded': time.strftime('%d.%m.%Y')}
        for name, limit in [('pronunciation', 120), ('context_example', 2000), ('context_example_pl', 2000)]:
            payload[name] = clean(data.get(name), limit)
        if data.get('translation_kind') in ('contextual', 'dictionary'):
            payload['translation_kind'] = data['translation_kind']
        for name in ('repetitions', 'easeFactor', 'interval'):
            value = data.get(name)
            if type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 10000:
                payload[name] = value
        if isinstance(data.get('nextReviewDate'), str):
            from datetime import date
            try:
                payload['nextReviewDate'] = date.fromisoformat(data['nextReviewDate']).isoformat()
            except ValueError:
                pass
        rows = remote('POST', '/rest/v1/rpc/wordclick_save_vocabulary', token=access,
                      data={'p_word_key': word_key, 'p_payload': payload})
        if not rows:
            raise AccountError(503, 'Nie udało się zapisać słowa.')
        return jsonify(item={**rows[0]['payload'], 'id': rows[0]['id']})

    @app.get('/healthz')
    def health():
        return jsonify(ok=True)
