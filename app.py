import os
import re
import json
import requests
import xml.etree.ElementTree as ET
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor
from public_fetch import fetch_public_article

load_dotenv()

app = Flask(__name__, static_folder='static', static_url_path='')

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY')

import html

# 100% Verified Open Direct News Feeds (Full Open Articles, No Paywalls)
NEWS_FEEDS = [
    # Świat / World
    {
        "source": "BBC News",
        "category": "Świat",
        "url": "http://feeds.bbci.co.uk/news/world/rss.xml",
        "badge_color": "#bb1919"
    },
    {
        "source": "The Guardian",
        "category": "Świat",
        "url": "https://www.theguardian.com/world/rss",
        "badge_color": "#052962"
    },
    {
        "source": "NPR News",
        "category": "Świat",
        "url": "https://feeds.npr.org/1001/rss.xml",
        "badge_color": "#d92b2b"
    },
    # Biznes / Business
    {
        "source": "CNBC Business",
        "category": "Biznes",
        "url": "https://www.cnbc.com/id/10001147/device/rss/rss.html",
        "badge_color": "#002b66"
    },
    {
        "source": "Entrepreneur",
        "category": "Biznes",
        "url": "https://www.entrepreneur.com/latest.rss",
        "badge_color": "#c41230"
    },
    # Finanse / Finance
    {
        "source": "CNBC Markets",
        "category": "Finanse",
        "url": "https://www.cnbc.com/id/10000664/device/rss/rss.html",
        "badge_color": "#006633"
    },
    {
        "source": "Yahoo Finance",
        "category": "Finanse",
        "url": "https://finance.yahoo.com/news/rssindex",
        "badge_color": "#6001d2"
    },
    # Technologia / Tech
    {
        "source": "TechCrunch",
        "category": "Technologia",
        "url": "https://techcrunch.com/feed/",
        "badge_color": "#0284c7"
    },
    {
        "source": "Ars Technica",
        "category": "Technologia",
        "url": "https://feeds.arstechnica.com/arstechnica/index",
        "badge_color": "#d0392b"
    },
    {
        "source": "Wired",
        "category": "Technologia",
        "url": "https://www.wired.com/feed/rss",
        "badge_color": "#000000"
    },
    # Project Management & Agile
    {
        "source": "Mountain Goat Agile",
        "category": "Project Management",
        "url": "https://www.mountaingoatsoftware.com/blog/rss",
        "badge_color": "#059669"
    },
    {
        "source": "InfoQ Software & PM",
        "category": "Project Management",
        "url": "https://feed.infoq.com/",
        "badge_color": "#0284c7"
    },
    {
        "source": "PM Majik Leadership",
        "category": "Project Management",
        "url": "https://www.pmmajik.com/feed/",
        "badge_color": "#d97706"
    }
]

def is_cookie_or_paywall_text(text, url=""):
    if not text:
        return True
    if "consent.google.com" in url or "accounts.google.com" in url:
        return True

    lower_text = text.lower()
    phrases = [
        "we use cookies",
        "accept all",
        "reject all",
        "cookies and data",
        "privacy settings",
        "before you continue to google",
        "sign in to continue",
        "subscribe to read",
        "paywall",
        "manage your privacy settings",
    ]
    return any(p in lower_text for p in phrases)

def extract_rss_link(item):
    l = item.find('link')
    if l is not None:
        if l.text and l.text.strip():
            return l.text.strip()
        if l.get('href'):
            return l.get('href').strip()
        if l.tail and l.tail.strip():
            return l.tail.strip()
    return ""

PARTICLES = [
    'out of', 'out', 'in', 'up', 'down', 'off', 'on', 'away', 'back', 
    'over', 'through', 'about', 'ahead', 'around', 'aside', 'by', 
    'forward', 'along', 'with', 'for', 'to', 'into', 'upon', 'across'
]

KNOWN_PHRASES = {
    "roll out": {"phrase": "roll out", "phrase_type": "Phrasal Verb", "translation": "rozwijać, wprowadzać na rynek", "possible_meanings": ["rozwijać", "wprowadzać na rynek", "prezentować"]},
    "rolling out": {"phrase": "rolling out", "phrase_type": "Phrasal Verb", "translation": "rozwijanie, wprowadzanie na rynek", "possible_meanings": ["rozwijanie", "wprowadzanie na rynek"]},
    "rolled out": {"phrase": "rolled out", "phrase_type": "Phrasal Verb", "translation": "rozwinął, wprowadził na rynek", "possible_meanings": ["rozwinął", "wprowadził na rynek"]},
    "rolls out": {"phrase": "rolls out", "phrase_type": "Phrasal Verb", "translation": "rozwija, wprowadza na rynek", "possible_meanings": ["rozwija", "wprowadza na rynek"]},
    "scale up": {"phrase": "scale up", "phrase_type": "Phrasal Verb", "translation": "zwiększać skalę, rozbudowywać", "possible_meanings": ["zwiększać skalę", "rozbudowywać"]},
    "scaling up": {"phrase": "scaling up", "phrase_type": "Phrasal Verb", "translation": "zwiększanie skali, rozbudowa", "possible_meanings": ["zwiększanie skali", "rozbudowywanie"]},
    "scaled up": {"phrase": "scaled up", "phrase_type": "Phrasal Verb", "translation": "zwiększono skalę, rozbudowano", "possible_meanings": ["zwiększono skalę"]},
    "scales up": {"phrase": "scales up", "phrase_type": "Phrasal Verb", "translation": "zwiększa skalę", "possible_meanings": ["zwiększa skalę"]},
    "ramp up": {"phrase": "ramp up", "phrase_type": "Phrasal Verb", "translation": "gwałtownie zwiększać, przyspieszać", "possible_meanings": ["gwałtownie zwiększać", "intensyfikować"]},
    "ramping up": {"phrase": "ramping up", "phrase_type": "Phrasal Verb", "translation": "gwałtowne zwiększanie, intensyfikacja", "possible_meanings": ["gwałtowne zwiększanie"]},
    "ramped up": {"phrase": "ramped up", "phrase_type": "Phrasal Verb", "translation": "zwiększono gwałtownie", "possible_meanings": ["zwiększono gwałtownie"]},
    "carry out": {"phrase": "carry out", "phrase_type": "Phrasal Verb", "translation": "przeprowadzać, realizować", "possible_meanings": ["przeprowadzać", "realizować", "wykonywać"]},
    "carrying out": {"phrase": "carrying out", "phrase_type": "Phrasal Verb", "translation": "przeprowadzanie, realizacja", "possible_meanings": ["przeprowadzanie", "realizowanie"]},
    "carried out": {"phrase": "carried out", "phrase_type": "Phrasal Verb", "translation": "przeprowadzono, zrealizowano", "possible_meanings": ["przeprowadzono", "zrealizowano"]},
    "carries out": {"phrase": "carries out", "phrase_type": "Phrasal Verb", "translation": "przeprowadza, realizuje", "possible_meanings": ["przeprowadza", "realizuje"]},
    "rule out": {"phrase": "rule out", "phrase_type": "Phrasal Verb", "translation": "wykluczać, odrzucać", "possible_meanings": ["wykluczać", "odrzucać"]},
    "ruled out": {"phrase": "ruled out", "phrase_type": "Phrasal Verb", "translation": "wykluczono, odrzucono", "possible_meanings": ["wykluczono", "odrzucono"]},
    "ruling out": {"phrase": "ruling out", "phrase_type": "Phrasal Verb", "translation": "wykluczanie, odrzucanie", "possible_meanings": ["wykluczanie", "odrzucanie"]},
    "phase out": {"phrase": "phase out", "phrase_type": "Phrasal Verb", "translation": "wycofywać stopniowo", "possible_meanings": ["wycofywać stopniowo", "stopniowo wygaszać"]},
    "phasing out": {"phrase": "phasing out", "phrase_type": "Phrasal Verb", "translation": "stopniowe wycofywanie", "possible_meanings": ["stopniowe wycofywanie"]},
    "phased out": {"phrase": "phased out", "phrase_type": "Phrasal Verb", "translation": "wycofano stopniowo", "possible_meanings": ["wycofano stopniowo"]},
    "crack down": {"phrase": "crack down", "phrase_type": "Phrasal Verb", "translation": "wprowadzać surowe środki, zwalczać", "possible_meanings": ["zwalczać", "wprowadzać rygor"]},
    "crack down on": {"phrase": "crack down on", "phrase_type": "Phrasal Verb", "translation": "surowo zwalczać, ukrócić", "possible_meanings": ["surowo zwalczać", "ukrócić"]},
    "cracking down on": {"phrase": "cracking down on", "phrase_type": "Phrasal Verb", "translation": "surowe zwalczanie", "possible_meanings": ["surowe zwalczanie"]},
    "cracked down on": {"phrase": "cracked down on", "phrase_type": "Phrasal Verb", "translation": "surowo ukrócono", "possible_meanings": ["surowo ukrócono"]},
    "wind down": {"phrase": "wind down", "phrase_type": "Phrasal Verb", "translation": "stopniowo kończyć, wygaszać", "possible_meanings": ["stopniowo kończyć", "wygaszać"]},
    "winding down": {"phrase": "winding down", "phrase_type": "Phrasal Verb", "translation": "stopniowe wygaszanie", "possible_meanings": ["stopniowe wygaszanie"]},
    "wound down": {"phrase": "wound down", "phrase_type": "Phrasal Verb", "translation": "wygaszono, zakończono", "possible_meanings": ["wygaszono"]},
    "speed up": {"phrase": "speed up", "phrase_type": "Phrasal Verb", "translation": "przyspieszać", "possible_meanings": ["przyspieszać"]},
    "speeding up": {"phrase": "speeding up", "phrase_type": "Phrasal Verb", "translation": "przyspieszanie", "possible_meanings": ["przyspieszanie"]},
    "sped up": {"phrase": "sped up", "phrase_type": "Phrasal Verb", "translation": "przyspieszono", "possible_meanings": ["przyspieszono"]},
    "set up": {"phrase": "set up", "phrase_type": "Phrasal Verb", "translation": "zakładać, organizować, tworzyć", "possible_meanings": ["zakładać", "organizować", "tworzyć"]},
    "setting up": {"phrase": "setting up", "phrase_type": "Phrasal Verb", "translation": "zakładanie, tworzenie", "possible_meanings": ["zakładanie", "tworzenie"]},
    "pick up": {"phrase": "pick up", "phrase_type": "Phrasal Verb", "translation": "odbierać, podnosić, ożywiać się", "possible_meanings": ["odbierać", "podnosić", "ożywiać się"]},
    "picking up": {"phrase": "picking up", "phrase_type": "Phrasal Verb", "translation": "odbieranie, ożywianie się", "possible_meanings": ["odbieranie", "ożywianie się"]},
    "picked up": {"phrase": "picked up", "phrase_type": "Phrasal Verb", "translation": "odebrano, ożywiło się", "possible_meanings": ["odebrano", "ożywiło się"]},
    "find out": {"phrase": "find out", "phrase_type": "Phrasal Verb", "translation": "dowiadywać się, odkrywać", "possible_meanings": ["dowiadywać się", "odkrywać"]},
    "finding out": {"phrase": "finding out", "phrase_type": "Phrasal Verb", "translation": "dowiadywanie się", "possible_meanings": ["dowiadywanie się"]},
    "found out": {"phrase": "found out", "phrase_type": "Phrasal Verb", "translation": "dowiedziano się, odkryto", "possible_meanings": ["dowiedziano się", "odkryto"]},
    "take off": {"phrase": "take off", "phrase_type": "Phrasal Verb", "translation": "startować, odnieść nagły sukces", "possible_meanings": ["startować (samolot)", "odnieść sukces"]},
    "taking off": {"phrase": "taking off", "phrase_type": "Phrasal Verb", "translation": "startowanie, nabieranie tempa", "possible_meanings": ["startowanie", "nabieranie tempa"]},
    "took off": {"phrase": "took off", "phrase_type": "Phrasal Verb", "translation": "wystartował, nabrał tempa", "possible_meanings": ["wystartował"]},
    "work out": {"phrase": "work out", "phrase_type": "Phrasal Verb", "translation": "sprawdzić się, wypracować, ćwiczyć", "possible_meanings": ["wypracować", "sprawdzić się", "ćwiczyć"]},
    "working out": {"phrase": "working out", "phrase_type": "Phrasal Verb", "translation": "wypracowywanie, ćwiczenie", "possible_meanings": ["wypracowywanie", "ćwiczenie"]},
    "worked out": {"phrase": "worked out", "phrase_type": "Phrasal Verb", "translation": "wypracowano, sprawdziło się", "possible_meanings": ["wypracowano"]},
    "bring up": {"phrase": "bring up", "phrase_type": "Phrasal Verb", "translation": "poruszać (temat), wychowywać", "possible_meanings": ["poruszać temat", "wychowywać"]},
    "bringing up": {"phrase": "bringing up", "phrase_type": "Phrasal Verb", "translation": "poruszanie tematu", "possible_meanings": ["poruszanie tematu"]},
    "brought up": {"phrase": "brought up", "phrase_type": "Phrasal Verb", "translation": "poruszono, wychowano", "possible_meanings": ["poruszono temat", "wychowano"]},
    "turn out": {"phrase": "turn out", "phrase_type": "Phrasal Verb", "translation": "okazać się", "possible_meanings": ["okazać się", "wytwarzać"]},
    "turning out": {"phrase": "turning out", "phrase_type": "Phrasal Verb", "translation": "okazywanie się", "possible_meanings": ["okazywanie się"]},
    "turned out": {"phrase": "turned out", "phrase_type": "Phrasal Verb", "translation": "okazało się", "possible_meanings": ["okazało się"]},
    "point out": {"phrase": "point out", "phrase_type": "Phrasal Verb", "translation": "wskazywać, zwracać uwagę", "possible_meanings": ["wskazywać", "zwracać uwagę"]},
    "pointing out": {"phrase": "pointing out", "phrase_type": "Phrasal Verb", "translation": "wskazywanie", "possible_meanings": ["wskazywanie"]},
    "pointed out": {"phrase": "pointed out", "phrase_type": "Phrasal Verb", "translation": "wskazał, zwrócił uwagę", "possible_meanings": ["wskazał", "zwrócił uwagę"]},
    "stay out": {"phrase": "stay out", "phrase_type": "Phrasal Verb", "translation": "trzymać się z dala", "possible_meanings": ["trzymać się z dala"]},
    "staying out": {"phrase": "staying out", "phrase_type": "Phrasal Verb", "translation": "trzymanie się z dala", "possible_meanings": ["trzymanie się z dala"]},
    "stay out of": {"phrase": "stay out of", "phrase_type": "Phrasal Verb", "translation": "trzymać się z dala od", "possible_meanings": ["trzymać się z dala od"]},
    "staying out of": {"phrase": "staying out of", "phrase_type": "Phrasal Verb", "translation": "trzymanie się z dala od", "possible_meanings": ["trzymanie się z dala od"]},
    "step down": {"phrase": "step down", "phrase_type": "Phrasal Verb", "translation": "ustępować ze stanowiska, rezygnować", "possible_meanings": ["ustępować ze stanowiska", "rezygnować"]},
    "stepping down": {"phrase": "stepping down", "phrase_type": "Phrasal Verb", "translation": "ustępowanie ze stanowiska", "possible_meanings": ["ustępowanie ze stanowiska"]},
    "stepped down": {"phrase": "stepped down", "phrase_type": "Phrasal Verb", "translation": "ustąpił ze stanowiska", "possible_meanings": ["ustąpił ze stanowiska"]},
    "step up": {"phrase": "step up", "phrase_type": "Phrasal Verb", "translation": "zwiększać wysiłki, przyspieszać", "possible_meanings": ["zwiększać wysiłki", "przyspieszać"]},
    "stepping up": {"phrase": "stepping up", "phrase_type": "Phrasal Verb", "translation": "zwiększanie wysiłków", "possible_meanings": ["zwiększanie wysiłków"]},
    "stepped up": {"phrase": "stepped up", "phrase_type": "Phrasal Verb", "translation": "zwiększono wysiłki", "possible_meanings": ["zwiększono wysiłki"]},
    "tit for tat": {"phrase": "tit for tat", "phrase_type": "Idiom / Expression", "translation": "wet za wet, odwetowy", "possible_meanings": ["wet za wet", "działanie odwetowe"]},
    "tit-for-tat": {"phrase": "tit-for-tat", "phrase_type": "Idiom / Expression", "translation": "wet za wet, odwetowy", "possible_meanings": ["odwetowy", "wet za wet"]},
    "when it comes to": {"phrase": "when it comes to", "phrase_type": "Idiom / Expression", "translation": "jeśli chodzi o, w kwestii", "possible_meanings": ["jeśli chodzi o", "w kwestii"]}
}

FALLBACK_DICTIONARY = {
    "means": {
        "word": "means",
        "translation": "oznacza, środki, sposób",
        "pronunciation": "/miːnz/",
        "possible_meanings": ["oznacza", "środki", "sposób", "możliwości", "droga"]
    },
    "district": {
        "word": "district",
        "translation": "dzielnica, dystrykt, okręg",
        "pronunciation": "/ˈdɪstrɪkt/",
        "possible_meanings": ["dzielnica", "dystrykt", "okręg", "rejon"]
    },
    "buzzing": {
        "word": "buzzing",
        "translation": "brzęczenie, buczenie",
        "pronunciation": "/ˈbʌzɪŋ/",
        "possible_meanings": ["brzęczenie", "buczenie", "bzykanie"]
    },
    "believes": {
        "word": "believes",
        "translation": "uważa, wierzy",
        "pronunciation": "/bɪˈliːvz/",
        "possible_meanings": ["uważa", "wierzy", "jest przekonany"]
    },
    "sway": {
        "word": "sway",
        "translation": "wywierać wpływ, chwiać, przekonywać",
        "pronunciation": "/sweɪ/",
        "possible_meanings": ["wywierać wpływ", "przekonywać", "kołysać"]
    },
    "yields": {
        "word": "yields",
        "translation": "rentowności, zyski, plony",
        "pronunciation": "/jiːldz/",
        "possible_meanings": ["rentowności (obligacji)", "zyski", "plony", "dawać wynik"]
    },
    "spike": {
        "word": "spike",
        "translation": "gwałtowny wzrost, skok",
        "pronunciation": "/spaɪk/",
        "possible_meanings": ["gwałtowny wzrost", "skok cen/rentowności", "szpic"]
    },
    "debt": {
        "word": "debt",
        "translation": "dług, zadłużenie",
        "pronunciation": "/det/",
        "possible_meanings": ["dług", "zadłużenie", "zobowiązanie"]
    },
    "risk": {
        "word": "risk",
        "translation": "ryzyko, zagrożenie",
        "pronunciation": "/rɪsk/",
        "possible_meanings": ["ryzyko", "zagrożenie", "ryzykować"]
    }
}

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

def fetch_feed_articles(feed_info):
    all_articles = []
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    try:
        res = requests.get(feed_info['url'].replace('http://', 'https://', 1), headers=headers, timeout=5)
        if res.status_code == 200:
            root = ET.fromstring(res.content)
            items = root.findall('.//item') or root.findall('.//{http://www.w3.org/2005/Atom}entry')

            for item in items[:6]:
                title_el = item.find('title')
                desc_el = item.find('description') or item.find('{http://www.w3.org/2005/Atom}summary') or item.find('{http://www.w3.org/2005/Atom}content')
                pub_el = item.find('pubDate') or item.find('{http://www.w3.org/2005/Atom}updated')

                title = title_el.text.strip() if title_el is not None and title_el.text else ""
                link = extract_rss_link(item)
                raw_desc = desc_el.text.strip() if desc_el is not None and desc_el.text else ""
                pub_date = pub_el.text.strip() if pub_el is not None and pub_el.text else ""

                # Clean title
                clean_title = html.unescape(title)
                clean_title = re.sub(r'\s*[\-\|]\s*(ProjectManagement\.com|The Economist|BBC News|Reuters|Financial Times|Bloomberg|TechCrunch|MIT Technology Review|The Verge|HBR|Harvard Business Review)\s*$', '', clean_title, flags=re.IGNORECASE).strip()

                # Clean description
                clean_desc = html.unescape(raw_desc)
                clean_desc = re.sub(r'<[^>]+>', '', clean_desc)
                clean_desc = re.sub(r'&nbsp;', ' ', clean_desc).replace('\xa0', ' ').strip()
                clean_desc = re.sub(r'\s*[\-\|]\s*ProjectManagement\.com.*$', '', clean_desc, flags=re.IGNORECASE).strip()

                if clean_title and link:
                    all_articles.append({
                        'title': clean_title,
                        'link': link,
                        'description': clean_desc,
                        'pubDate': pub_date,
                        'source': feed_info['source'],
                        'category': feed_info['category'],
                        'badge_color': feed_info['badge_color']
                    })
    except Exception as e:
        print(f"[RSS Error for {feed_info['source']}] {e}")

    return all_articles

@app.route('/api/news-feed', methods=['GET'])
def get_news_feed():
    with ThreadPoolExecutor(max_workers=6) as pool:
        batches = pool.map(fetch_feed_articles, NEWS_FEEDS)
        all_articles = [article for batch in batches for article in batch]
    return jsonify({'articles': all_articles, 'total': len(all_articles)})


@app.route('/api/import-url', methods=['POST'])
def import_url():
    data = request.get_json() or {}
    url = data.get('url', '').strip()

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
        }
        res = fetch_public_article(url, headers)
        res.raise_for_status()
        res.encoding = 'utf-8'
        soup = BeautifulSoup(res.text, 'html.parser')

        for element in soup(["script", "style", "nav", "header", "footer", "form", "button", "aside", "iframe", "figure", "figcaption"]):
            element.decompose()

        title = ""
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            title = og_title["content"].strip()
        elif soup.find("h1"):
            title = soup.find("h1").get_text().strip()
        elif soup.title:
            title = soup.title.get_text().strip()

        title = html.unescape(title)

        article_body = soup.find("article") or soup.find("main") or soup.body
        paragraphs = []

        unwanted_phrases = [
            'video cannot be played',
            'video can not be played',
            'watch:',
            'media caption',
            'image caption',
            'photo:',
            'sign up for',
            'subscribe to'
        ]

        if article_body:
            for p in article_body.find_all("p"):
                text = p.get_text().strip()
                text = html.unescape(text)
                text = re.sub(r'[\u2018\u2019\u201b\u2032]', "'", text)
                text = re.sub(r'[\u201c\u201d\u201f\u2033]', '"', text)

                lower_p = text.lower()
                if any(u in lower_p for u in unwanted_phrases):
                    continue

                if len(text.split()) > 5:
                    paragraphs.append(text)

        full_content = "\n\n".join(paragraphs)

        if not full_content or len(full_content.split()) < 10:
            all_ps = [html.unescape(p.get_text().strip()) for p in soup.find_all("p") if len(p.get_text().strip().split()) > 5]
            full_content = "\n\n".join(all_ps[:15])

        if is_cookie_or_paywall_text(full_content, res.url):
            return jsonify({
                'error': 'This article is protected by a cookie consent wall or paywall.',
                'is_blocked': True
            }), 422

        parsed_url = urlparse(url)
        domain = parsed_url.netloc.replace('www.', '')

        word_count = len(full_content.split())

        return jsonify({
            'title': title or 'Imported Article',
            'content': full_content,
            'url': url,
            'domain': domain,
            'word_count': word_count
        })

    except (ValueError, requests.RequestException):
        return jsonify({'error': 'Nie udało się otworzyć publicznego artykułu HTTPS. Wklej jego tekst.'}), 422


@app.route('/api/translate', methods=['POST'])
def translate_word():
    data = request.get_json() or {}
    raw_word = data.get('word', '').strip()
    sentence = data.get('sentence', '').strip()
    full_text = data.get('full_text', '').strip()

    if not raw_word:
        return jsonify({'error': 'Word is required'}), 400

    clean_word = re.sub(r'^[^\w]+|[^\w]+$', '', raw_word).lower()

    if data.get('prefer_browser') is True:
        # The browser performs contextual translation. The server only resolves
        # the exact word/phrase span, avoiding cloud-IP provider refusals.
        sentence = sentence[:2000]
        raw_word = raw_word[:120]
        offset = data.get('word_offset')
        if type(offset) is not int or offset < 0 or sentence[offset:offset + len(raw_word)].lower() != raw_word.lower():
            match = re.search(r'\b' + re.escape(raw_word) + r'\b', sentence, re.I)
            offset = match.start() if match else 0
        phrase = None
        for phrase_key, item in KNOWN_PHRASES.items():
            if clean_word not in phrase_key.split():
                continue
            for match in re.finditer(r'\b' + re.escape(phrase_key) + r'\b', sentence, re.I):
                if match.start() <= offset < match.end():
                    phrase = {**item, 'start': match.start(), 'end': match.end()}
                    break
            if phrase:
                break
        if not phrase and is_phrasal_root(clean_word):
            for particle in PARTICLES:
                match = re.match(r'\b(' + re.escape(clean_word) + r'\s+' + re.escape(particle) + r')\b', sentence[offset:], re.I)
                if match:
                    phrase = {'phrase': match.group(1), 'phrase_type': 'Phrasal Verb',
                              'start': offset, 'end': offset + len(match.group(1))}
                    break
        dictionary = FALLBACK_DICTIONARY.get(clean_word, {})
        known = phrase.get('translation') if phrase else dictionary.get('translation')
        return jsonify(word=raw_word, clean_word=clean_word, is_phrase=bool(phrase),
                       phrase=phrase.get('phrase') if phrase else None,
                       phrase_type=phrase.get('phrase_type') if phrase else None,
                       translation=known, pronunciation=dictionary.get('pronunciation', ''),
                       possible_meanings=(phrase or dictionary).get('possible_meanings', []),
                       context_example=sentence or raw_word, word_offset=offset,
                       target_start=phrase['start'] if phrase else offset,
                       target_end=phrase['end'] if phrase else offset + len(raw_word),
                       needs_browser_translation=True, source='dictionary' if known else 'browser')

    detected_phrase = detect_phrasal_verb(clean_word, raw_word, sentence)

    if GEMINI_API_KEY:
        try:
            ai_result = fetch_gemini_translation(raw_word, clean_word, sentence, full_text, detected_phrase)
            if ai_result:
                return jsonify(ai_result)
        except Exception as e:
            print(f"[Gemini API Error] {e}. Using web translation fallback.")

    result = fetch_dynamic_translation(raw_word, clean_word, sentence, detected_phrase)
    return jsonify(result)


COMMON_PHRASAL_VERB_ROOTS = {
    'act', 'add', 'back', 'blow', 'blew', 'blown', 'break', 'broke', 'broken', 'bring', 'brought',
    'build', 'built', 'call', 'carry', 'check', 'clean', 'clear', 'come', 'came', 'count', 'cut',
    'do', 'did', 'done', 'draw', 'drew', 'drawn', 'drop', 'end', 'fall', 'fell', 'fallen', 'fill',
    'find', 'found', 'get', 'got', 'gotten', 'give', 'gave', 'given', 'go', 'went', 'gone', 'grow',
    'grew', 'grown', 'hand', 'hang', 'hung', 'hold', 'held', 'keep', 'kept', 'kick', 'knock', 'lay',
    'laid', 'lead', 'led', 'let', 'look', 'make', 'made', 'pass', 'pay', 'paid', 'pick', 'point',
    'pull', 'put', 'run', 'ran', 'scale', 'ramp', 'phase', 'rule', 'wind', 'wound', 'crack', 'set',
    'show', 'showed', 'shown', 'shut', 'stand', 'stood', 'start', 'step', 'take', 'took', 'taken',
    'talk', 'think', 'thought', 'throw', 'threw', 'thrown', 'turn', 'use', 'walk', 'work', 'write', 'wrote', 'written'
}

def is_phrasal_root(word):
    word = word.lower().strip()
    if word in COMMON_PHRASAL_VERB_ROOTS:
        return True
    if word.endswith('ied'):
        stem = word[:-3] + 'y'
        if stem in COMMON_PHRASAL_VERB_ROOTS:
            return True
    for s in ['ing', 'ed', 'es', 's']:
        if word.endswith(s):
            stem = word[:-len(s)]
            if stem in COMMON_PHRASAL_VERB_ROOTS or (stem + 'e') in COMMON_PHRASAL_VERB_ROOTS:
                return True
            if len(stem) > 2 and stem[-1] == stem[-2]:
                single_stem = stem[:-1]
                if single_stem in COMMON_PHRASAL_VERB_ROOTS:
                    return True
    return False


def detect_phrasal_verb(clean_word, raw_word, sentence):
    if not sentence:
        return None

    # 1. High precision match against KNOWN_PHRASES dictionary
    for phrase_key, phrase_info in KNOWN_PHRASES.items():
        pattern = r'\b' + re.escape(phrase_key) + r'\b'
        if re.search(pattern, sentence, re.IGNORECASE):
            if clean_word in phrase_key.lower().split():
                return {
                    "phrase": phrase_key,
                    "phrase_type": phrase_info.get("phrase_type", "Phrasal Verb"),
                    "translation": phrase_info.get("translation"),
                    "possible_meanings": phrase_info.get("possible_meanings", [])
                }

    # 2. Dynamic detection for verb + particle combinations
    if is_phrasal_root(clean_word):
        for particle in PARTICLES:
            pattern = r'\b(' + re.escape(clean_word) + r'\s+' + re.escape(particle) + r')\b'
            match = re.search(pattern, sentence, re.IGNORECASE)
            if match:
                matched_phrase = match.group(1)
                return {
                    "phrase": matched_phrase,
                    "phrase_type": "Phrasal Verb",
                    "translation": None,
                    "possible_meanings": []
                }

    return None


def translate_single_text(text):
    if not text:
        return None, []
    q = requests.utils.quote(text)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,pl;q=0.8',
        'Referer': 'https://translate.google.com/'
    }

    # Primary: translate.googleapis.com dict-chrome-ex with dt=t and dt=bd
    try:
        url1 = f"https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=pl&dt=t&dt=bd&q={q}"
        r1 = requests.get(url1, headers=headers, timeout=5)
        if r1.status_code == 200:
            data = r1.json()
            main_trans = None
            dict_meanings = []
            if data and isinstance(data, list) and len(data) > 0 and data[0] and len(data[0]) > 0 and data[0][0] and data[0][0][0]:
                main_trans = data[0][0][0].strip()

            if len(data) > 1 and data[1]:
                for group in data[1]:
                    if len(group) > 1 and group[1]:
                        dict_meanings.extend(group[1])

            unique_meanings = []
            for m in dict_meanings:
                if m not in unique_meanings:
                    unique_meanings.append(m)

            if main_trans and main_trans.lower() == text.lower() and unique_meanings:
                main_trans = unique_meanings[0]

            if main_trans and main_trans.lower() != text.lower():
                return main_trans, unique_meanings
            elif unique_meanings:
                return unique_meanings[0], unique_meanings
    except Exception as e:
        print(f"[Translate Endpoint 1 Error] {e}")

    # Endpoint 2: MyMemory API
    try:
        url2 = f"https://api.mymemory.translated.net/get?q={q}&langpair=en|pl"
        r2 = requests.get(url2, headers=headers, timeout=4)
        if r2.status_code == 200:
            data2 = r2.json()
            t = data2.get('responseData', {}).get('translatedText', '')
            if t and t.lower() != text.lower():
                clean_t = html.unescape(t).strip()
                clean_t = re.sub(r'\(.*?\)', '', clean_t).strip()
                return clean_t or t, []
    except Exception as e:
        print(f"[Translate Endpoint 2 Error] {e}")

    # Endpoint 3: Google mtranslate HTML fallback
    try:
        url3 = f"https://translate.google.com/m?sl=en&tl=pl&q={q}"
        r3 = requests.get(url3, headers=headers, timeout=4)
        if r3.status_code == 200:
            soup = BeautifulSoup(r3.text, 'html.parser')
            res_div = soup.find('div', class_='result-container') or soup.find('div', class_='t0')
            if res_div and res_div.text.strip():
                t = res_div.text.strip()
                if t.lower() != text.lower():
                    return t, []
    except Exception as e:
        print(f"[Translate Endpoint 3 Error] {e}")

    return None, []


def translate_sentence_text(sentence):
    if not sentence:
        return None
    q = requests.utils.quote(sentence)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,pl;q=0.8',
        'Referer': 'https://translate.google.com/'
    }

    # Primary Endpoint: translate.googleapis.com
    try:
        url = f"https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=pl&dt=t&q={q}"
        r = requests.get(url, headers=headers, timeout=6)
        if r.status_code == 200:
            data = r.json()
            if data and isinstance(data, list) and len(data) > 0 and data[0]:
                full_t = ''.join([part[0] for part in data[0] if part and len(part) > 0 and part[0]])
                if full_t and full_t.strip():
                    return full_t.strip()
    except Exception as e:
        print(f"[Sentence Translate Endpoint 1 Error] {e}")

    # Endpoint 2: MyMemory API
    try:
        url2 = f"https://api.mymemory.translated.net/get?q={q}&langpair=en|pl"
        r2 = requests.get(url2, headers=headers, timeout=5)
        if r2.status_code == 200:
            data2 = r2.json()
            t = data2.get('responseData', {}).get('translatedText', '')
            if t:
                return html.unescape(t).strip()
    except Exception as e:
        print(f"[Sentence Translate Endpoint 2 Error] {e}")

    # Endpoint 3: Google mtranslate HTML fallback
    try:
        url3 = f"https://translate.google.com/m?sl=en&tl=pl&q={q}"
        r3 = requests.get(url3, headers=headers, timeout=5)
        if r3.status_code == 200:
            soup = BeautifulSoup(r3.text, 'html.parser')
            res_div = soup.find('div', class_='result-container') or soup.find('div', class_='t0')
            if res_div and res_div.text.strip():
                return res_div.text.strip()
    except Exception as e:
        print(f"[Sentence Translate Endpoint 3 Error] {e}")

    return None


def fetch_dynamic_translation(raw_word, clean_word, sentence, detected_phrase):
    word_pl = None
    sentence_pl = None
    possible_meanings = []
    is_phrase = False
    phrase_text = None
    phrase_type = None

    if detected_phrase:
        is_phrase = True
        phrase_text = detected_phrase.get("phrase")
        phrase_type = detected_phrase.get("phrase_type", "Phrasal Verb")

        if detected_phrase.get("translation"):
            word_pl = detected_phrase.get("translation")
            possible_meanings = detected_phrase.get("possible_meanings", [])

        if not word_pl:
            word_pl, meanings = translate_single_text(phrase_text)
            if meanings:
                possible_meanings = meanings

    if not word_pl:
        if clean_word in FALLBACK_DICTIONARY:
            dict_entry = FALLBACK_DICTIONARY[clean_word]
            word_pl = dict_entry.get("translation")
            possible_meanings = dict_entry.get("possible_meanings", [])

    if not word_pl:
        word_pl, meanings = translate_single_text(clean_word)
        if meanings and not possible_meanings:
            possible_meanings = meanings

    if sentence:
        sentence_pl = translate_sentence_text(sentence)

    # Word Stemming Fallback if translation is missing or equals raw English word
    if not word_pl or word_pl.lower() == clean_word.lower():
        base_word = re.sub(r'(ing|ed|s|es|er|ly)$', '', clean_word)
        if base_word and len(base_word) > 2 and base_word != clean_word:
            base_pl, base_meanings = translate_single_text(base_word)
            if base_pl:
                word_pl = base_pl
                if base_meanings and not possible_meanings:
                    possible_meanings = base_meanings
            else:
                word_pl = clean_word
        else:
            word_pl = clean_word

    if not possible_meanings:
        possible_meanings = [word_pl]

    return {
        "word": raw_word,
        "clean_word": clean_word,
        "is_phrase": is_phrase,
        "phrase": phrase_text,
        "phrase_type": phrase_type,
        "translation": word_pl,
        "pronunciation": f"/{phrase_text or clean_word}/",
        "context_example": sentence or raw_word,
        "context_example_pl": sentence_pl or (f"Przetłumaczone zdanie: {word_pl}" if word_pl != clean_word else sentence or raw_word),
        "possible_meanings": possible_meanings[:5],
        "source": "multi-engine-translator"
    }


from render_accounts import register_accounts
register_accounts(app)

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    print(f"Starting WordClick v2 server on http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
