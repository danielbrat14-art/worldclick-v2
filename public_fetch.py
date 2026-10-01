"""Bounded HTTPS fetching for user-supplied article URLs."""
import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import requests


def validate_public_url(url):
    parsed = urlparse(url)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
            or parsed.port not in (None, 443)):
        raise ValueError('Podaj publiczny adres HTTPS artykułu.')
    host = parsed.hostname.lower().rstrip('.')
    if host == 'localhost' or host.endswith(('.localhost', '.local', '.internal')):
        raise ValueError('Adres lokalny nie jest dozwolony.')
    try:
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise ValueError('Nie udało się odnaleźć strony artykułu.')
    if not addresses or any(not ipaddress.ip_address(entry[4][0]).is_global for entry in addresses):
        raise ValueError('Adres prywatny nie jest dozwolony.')
    return url


def fetch_public_article(url, headers):
    for _ in range(4):
        validate_public_url(url)
        response = requests.get(url, headers=headers, timeout=10, stream=True,
                                allow_redirects=False)
        if response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get('Location')
            response.close()
            if not location:
                raise ValueError('Nieprawidłowe przekierowanie.')
            url = urljoin(url, location)
            continue
        response.raise_for_status()
        chunks, size = [], 0
        try:
            for chunk in response.iter_content(chunk_size=65536):
                size += len(chunk)
                if size > 1500000:
                    raise ValueError('Artykuł jest zbyt duży. Wklej wybrany fragment.')
                chunks.append(chunk)
        finally:
            response.close()
        response._content = b''.join(chunks)
        response._content_consumed = True
        return response
    raise ValueError('Zbyt wiele przekierowań. Wklej tekst artykułu.')
