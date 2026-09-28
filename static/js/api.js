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

async function fetchClientSideTranslation(text) {
  const clean = text.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();
  if (!clean) return { translation: null, possible_meanings: [] };

  const q = encodeURIComponent(clean);

  // 1. Try Google Translate (client=gtx) directly from user's browser
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pl&dt=t&dt=bd&q=${q}`);
    if (res.ok) {
      const data = await res.json();
      let mainTrans = data?.[0]?.[0]?.[0]?.trim();
      let dictMeanings = [];
      if (data?.[1]) {
        data[1].forEach(group => {
          if (group?.[1]) dictMeanings.push(...group[1]);
        });
      }
      const uniqueMeanings = Array.from(new Set(dictMeanings));
      if (mainTrans && mainTrans.toLowerCase() === clean && uniqueMeanings.length > 0) {
        mainTrans = uniqueMeanings[0];
      }
      if (mainTrans && mainTrans.toLowerCase() !== clean) {
        return { translation: mainTrans, possible_meanings: uniqueMeanings };
      } else if (uniqueMeanings.length > 0) {
        return { translation: uniqueMeanings[0], possible_meanings: uniqueMeanings };
      }
    }
  } catch (e) {
    console.warn('[Browser JS] Google Translate fetch failed:', e);
  }

  // 2. Try MyMemory API directly from user's browser
  try {
    const res2 = await fetch(`https://api.mymemory.translated.net/get?q=${q}&langpair=en|pl`);
    if (res2.ok) {
      const data2 = await res2.json();
      const t = data2?.responseData?.translatedText;
      if (t && t.toLowerCase() !== clean) {
        const cleanT = t.replace(/\(.*?\)/g, '').trim();
        return { translation: cleanT || t, possible_meanings: [cleanT || t] };
      }
    }
  } catch (e) {
    console.warn('[Browser JS] MyMemory fetch failed:', e);
  }

  return { translation: null, possible_meanings: [] };
}

async function fetchClientSideSentence(sentence) {
  if (!sentence || !sentence.trim()) return null;
  const q = encodeURIComponent(sentence.trim());

  // 1. Try Google Translate client=gtx directly from browser
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pl&dt=t&q=${q}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.[0] && Array.isArray(data[0])) {
        const fullT = data[0].map(part => part?.[0] || '').join('');
        if (fullT && fullT.trim()) return fullT.trim();
      }
    }
  } catch (e) {
    console.warn('[Browser JS] Sentence Google Translate failed:', e);
  }

  // 2. Try MyMemory API directly from browser
  try {
    const res2 = await fetch(`https://api.mymemory.translated.net/get?q=${q}&langpair=en|pl`);
    if (res2.ok) {
      const data2 = await res2.json();
      const t = data2?.responseData?.translatedText;
      if (t && t.trim()) return t.trim();
    }
  } catch (e) {
    console.warn('[Browser JS] Sentence MyMemory failed:', e);
  }

  return null;
}

export async function requestTranslation(word, sentenceContext, fullText) {
  const cleanWord = word.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();
  let backendData = null;

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

    if (response.ok) {
      backendData = await response.json();
    }
  } catch (error) {
    console.warn('Backend translation endpoint error:', error);
  }

  // Verify if backend translation returned a real Polish word
  const hasValidBackendTrans = backendData &&
    backendData.translation &&
    backendData.translation.toLowerCase() !== cleanWord &&
    backendData.translation.toLowerCase() !== word.toLowerCase();

  const hasValidBackendSentence = backendData &&
    backendData.context_example_pl &&
    backendData.context_example_pl !== sentenceContext &&
    !backendData.context_example_pl.startsWith('Wymiana zdań') &&
    !backendData.context_example_pl.startsWith('Przetłumaczone zdanie: ');

  if (hasValidBackendTrans && hasValidBackendSentence) {
    return backendData;
  }

  // CLIENT-SIDE BROWSER FALLBACK:
  // If backend returned untranslated word (due to Render.com cloud IP blocks),
  // translate directly in the user's browser!
  console.log('[WordClick] Triggering client-side browser translation fallback for:', cleanWord);

  try {
    const [clientTrans, clientSentence] = await Promise.all([
      hasValidBackendTrans ? Promise.resolve({ translation: backendData.translation, possible_meanings: backendData.possible_meanings || [] }) : fetchClientSideTranslation(cleanWord),
      hasValidBackendSentence ? Promise.resolve(backendData.context_example_pl) : fetchClientSideSentence(sentenceContext)
    ]);

    const finalWordPl = clientTrans.translation || (backendData ? backendData.translation : cleanWord);
    const finalMeanings = clientTrans.possible_meanings.length > 0 ? clientTrans.possible_meanings : (backendData?.possible_meanings || [finalWordPl]);
    const finalSentencePl = clientSentence || (backendData ? backendData.context_example_pl : sentenceContext);

    return {
      word: word,
      clean_word: cleanWord,
      is_phrase: backendData?.is_phrase || false,
      phrase: backendData?.phrase || null,
      phrase_type: backendData?.phrase_type || null,
      translation: finalWordPl,
      pronunciation: `/${cleanWord}/`,
      context_example: sentenceContext || word,
      context_example_pl: finalSentencePl || sentenceContext || word,
      possible_meanings: finalMeanings,
      source: 'client-side-browser-fallback'
    };
  } catch (err) {
    console.error('Client-side translation execution error:', err);
    return backendData || {
      word: word,
      clean_word: cleanWord,
      translation: cleanWord,
      pronunciation: `/${cleanWord}/`,
      context_example: sentenceContext || word,
      context_example_pl: sentenceContext || word,
      possible_meanings: [cleanWord],
      source: 'offline-fallback'
    };
  }
}
