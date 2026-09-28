import os
import re
import json
import requests
import xml.etree.ElementTree as ET
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv

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
    "roll out": {
        "phrase": "roll out",
        "phrase_type": "Phrasal Verb",
        "translation": "rozwijać (np. czerwony dywan), wprowadzać (nowe rozwiązania/usługi)",
        "possible_meanings": ["rozwijać (czerwony dywan)", "wprowadzać na rynek", "prezentować"]
    },
    "rolling out": {
        "phrase": "rolling out",
        "phrase_type": "Phrasal Verb",
        "translation": "rozwijający, wprowadzający (np. czerwony dywan / nowy projekt)",
        "possible_meanings": ["rozwijanie (dywanu)", "wprowadzanie na rynek"]
    },
    "stay out": {
        "phrase": "stay out",
        "phrase_type": "Phrasal Verb",
        "translation": "trzymać się z dala, nie mieszać się",
        "possible_meanings": ["trzymać się z dala", "nie ingerować", "zostawać na zewnątrz"]
    },
    "stay out of": {
        "phrase": "stay out of",
        "phrase_type": "Phrasal Verb",
        "translation": "trzymać się z dala od, nie mieszać się w",
        "possible_meanings": ["trzymać się z dala od", "nie mieszać się w (sprawy)"]
    },
    "tit for tat": {
        "phrase": "tit for tat",
        "phrase_type": "Idiom / Expression",
        "translation": "wet za wet, odwetowy (np. cła odwetowe)",
        "possible_meanings": ["wet za wet", "działanie odwetowe", "odpłacenie pięknym za nadobne"]
    },
    "tit-for-tat": {
        "phrase": "tit-for-tat",
        "phrase_type": "Idiom / Expression",
        "translation": "wet za wet, odwetowy (np. cła odwetowe)",
        "possible_meanings": ["odwetowy", "wet za wet"]
    },
    "when it comes to": {
        "phrase": "when it comes to",
        "phrase_type": "Idiom / Expression",
        "translation": "jeśli chodzi o, w kwestii, odnośnie do",
        "possible_meanings": ["jeśli chodzi o", "w kwestii", "odnośnie do"]
    }
}

FALLBACK_DICTIONARY = {
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
    }
}

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/news-feed', methods=['GET'])
def get_news_feed():
    all_articles = []
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    for feed_info in NEWS_FEEDS:
        try:
            res = requests.get(feed_info['url'], headers=headers, timeout=5, verify=False)
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
        res = requests.get(url, headers=headers, timeout=10, verify=False)
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

    except Exception as e:
        print(f"[URL Import Error] {e}")
        return jsonify({'error': f'Failed to import article from URL: {str(e)}'}), 500


@app.route('/api/translate', methods=['POST'])
def translate_word():
    data = request.get_json() or {}
    raw_word = data.get('word', '').strip()
    sentence = data.get('sentence', '').strip()
    full_text = data.get('full_text', '').strip()

    if not raw_word:
        return jsonify({'error': 'Word is required'}), 400

    clean_word = re.sub(r'^[^\w]+|[^\w]+$', '', raw_word).lower()

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
    'act', 'add', 'back', 'blow', 'break', 'bring', 'build', 'call', 'carry', 'check',
    'clean', 'clear', 'come', 'count', 'cut', 'do', 'draw', 'drop', 'end', 'fall',
    'fill', 'find', 'get', 'give', 'go', 'grow', 'hand', 'hang', 'hold', 'keep',
    'kick', 'knock', 'lay', 'lead', 'let', 'look', 'make', 'pass', 'pay', 'pick',
    'point', 'pull', 'put', 'run', 'set', 'show', 'shut', 'stand', 'start', 'step',
    'take', 'talk', 'think', 'throw', 'turn', 'use', 'walk', 'work', 'write'
}

def get_base_verb(word):
    word = word.lower().strip()
    if word in COMMON_PHRASAL_VERB_ROOTS:
        return word
    if word.endswith('ied'):
        stem = word[:-3] + 'y'
        if stem in COMMON_PHRASAL_VERB_ROOTS:
            return stem
    for suffix in ['ing', 'ed', 'es', 's']:
        if word.endswith(suffix):
            stem = word[:-len(suffix)]
            if stem in COMMON_PHRASAL_VERB_ROOTS:
                return stem
            if (stem + 'e') in COMMON_PHRASAL_VERB_ROOTS:
                return stem + 'e'
    return None


def detect_phrasal_verb(clean_word, raw_word, sentence):
    if not sentence:
        return None

    for phrase_key, phrase_info in KNOWN_PHRASES.items():
        pattern = r'\b' + re.escape(phrase_key) + r'\b'
        if re.search(pattern, sentence, re.IGNORECASE):
            if clean_word in phrase_key.lower().split():
                return {
                    "phrase": phrase_key,
                    "phrase_type": phrase_info.get("phrase_type", "Phrasal Verb / Phrase"),
                    "translation": phrase_info.get("translation"),
                    "possible_meanings": phrase_info.get("possible_meanings", [])
                }

    # Only check particle combinations if clean_word is an actual English verb root!
    base_v = get_base_verb(clean_word)
    if base_v:
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


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    print(f"Starting WordClick v2 server on http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
