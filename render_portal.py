"""Keep the Render address as an entry to the dispatch-authenticated portal."""
import os
from urllib.parse import urlparse

from flask import jsonify, redirect, request


def register_portal_redirect(app):
    portal = os.getenv('WORDCLICK_CHATGPT_PORTAL_URL', '').rstrip('/')
    if not portal:
        return
    parsed = urlparse(portal)
    if (parsed.scheme != 'https' or not parsed.hostname
            or not parsed.hostname.endswith('.chatgpt.site')
            or parsed.username or parsed.password or parsed.port
            or parsed.path or parsed.query or parsed.fragment):
        raise RuntimeError('The ChatGPT portal must be an HTTPS Sites origin.')

    @app.before_request
    def enter_chatgpt_portal():
        if request.path == '/healthz' and request.method in ('GET', 'HEAD'):
            return None
        if request.method in ('GET', 'HEAD'):
            # No identity headers, callback codes or query parameters are forwarded.
            return redirect(portal + '/', code=302)
        return jsonify(error='Otwórz aktualny portal, aby kontynuować.',
                       portal_url=portal + '/'), 410
