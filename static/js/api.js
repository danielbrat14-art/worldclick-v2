/**
 * Translation, URL Import & Live News Feed API Service for WordClick v2
 */

export async function fetchLiveNewsFeed() {
  try {
    const response = await fetch('/api/news-feed');
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }
    const data = await response.json();
    return data.articles || [];
  } catch (error) {
    console.error('Error fetching news feed:', error);
    return [];
  }
}

export async function fetchArticleFromUrl(url) {
  try {
    const response = await fetch('/api/import-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with status ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('URL article import error:', error);
    throw error;
  }
}

export async function requestTranslation(word, sentenceContext, fullText) {
  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        word: word,
        sentence: sentenceContext,
        full_text: fullText
      })
    });

    if (!response.ok) {
      throw new Error(`API response status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Translation fetch error:', error);
    const cleanWord = word.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();
    return {
      word: word,
      clean_word: cleanWord,
      translation: cleanWord,
      pronunciation: `/${cleanWord}/`,
      context_example: sentenceContext || word,
      context_example_pl: `Przykład użycia w kontekście`,
      possible_meanings: [cleanWord],
      source: 'offline-fallback'
    };
  }
}
