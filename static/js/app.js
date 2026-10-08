import { registerWordClickTools } from './webmcp.js';
import { initHomeNavigation } from './home.js';
import { estimateDifficulty, filterNewsArticles, difficultyDescription } from './difficulty.js';
/**
 * WordClick v2 Ultimate — Main Controller with Live News Feed
 */

import { renderInteractiveText } from './reader.js';
import { requestTranslation, fetchArticleFromUrl, fetchLiveNewsFeed } from './api.js';
import { initPopover, showPopoverLoading, showPopoverError, updatePopoverContent, hidePopover } from './popover.js';
import { getSavedVocabulary, removeWordFromVocabulary, clearAllVocabulary, initializeVocabulary, showAccountMessage, showLibraryStatus } from './storage.js';
import { playWordAudio } from './speech.js';
import { initKaraokePlayer, stopKaraokeReading } from './karaoke.js';
import { initFlashcards, initQuiz } from './srs.js';

// Curated Preset Articles for Featured Library
const PRESETS = {
  'ai-tech': {
    title: 'The Rise of Generative AI in Business',
    content: `Artificial intelligence is rapidly transforming global business as companies roll out automated workflows and generative algorithms. Organizations have been using machine learning models to improve efficiency, streamline customer support, and accelerate product design.

However, leaders emphasize that successful AI implementation requires proper governance, data privacy standards, and workforce retraining. As tech adoption speeds up, keeping all stakeholders aligned remains a top priority.`
  },
  'geopolitics': {
    title: 'Diplomacy and Global Trade Truces',
    content: `President Xi Jinping's summits with Donald Trump have one clear aim. China believes the United States is trying to contain its rise as a superpower, and it wants Washington to stay out of its way – particularly when it comes to trade, technology and Taiwan.

On this visit, however, despite Trump rolling out the red carpet for him, the Chinese leader didn't get everything he wanted. The trade truce that saw both countries pause a tit-for-tat tariff war was extended as both leaders look to project stability.`
  },
  'space': {
    title: 'Exploring Mars and the Outer Solar System',
    content: `International space agencies are launching ambitious robotic missions to investigate planetary atmospheres and search for past biosignatures on Mars. Scientists have deployed advanced rovers equipped with high-resolution cameras and soil analyzers.

These missions aim to figure out whether liquid water once flowed continuously across the Martian surface and to prepare the groundwork for future human exploration.`
  },
  'environment': {
    title: 'Clean Energy Transition and Climate Action',
    content: `Governments and clean technology innovators are accelerating renewable energy implementation to reduce carbon emissions. Solar and wind infrastructure projects are being scaled up across major industrial regions.

Experts point out that transitioning away from fossil fuels requires significant capital investment and grid modernization, but the long-term economic and environmental benefits are immense.`
  }
};

const DEFAULT_PASTE_EXAMPLE = `Yesterday I had a meeting with my manager about the upcoming project. We discussed the main risks, agreed on the next steps and reviewed the project deadline. One of the biggest challenges is making sure that all stakeholders are aligned before we start the implementation.`;

document.addEventListener('DOMContentLoaded', async () => {
  initPopover();
  initNavigation();
  initModeSelector();
  initNewsFeed();
  initUrlImporter();
  initInputHandlers();
  initLibraryHandlers();
  initVocabHandlers();
  initKaraokePlayer();
  initStudyTab();
  initFontSizeControls();
  initHomeNavigation(() => { readerRequestId++; showLibraryStatus(); });

  window.addEventListener('vocab-changed', () => { updateVocabBadge(); if(document.getElementById('vocab-view').classList.contains('active'))renderVocabularyGrid(document.getElementById('vocab-search').value.trim()); });
  updateVocabBadge();
  try { await initializeVocabulary(); registerWordClickTools(); }
  catch(error) { showAccountMessage(error.message + ' Odśwież stronę, aby spróbować ponownie.',true); }
});

function initFontSizeControls() {
  const articleBody = document.getElementById('interactive-text-body');
  const decBtn = document.getElementById('font-dec-btn');
  const resetBtn = document.getElementById('font-reset-btn');
  const incBtn = document.getElementById('font-inc-btn');
  const fontBtns = [decBtn, resetBtn, incBtn];

  if (!articleBody) return;

  if (decBtn) {
    decBtn.addEventListener('click', () => {
      articleBody.classList.remove('font-md', 'font-lg');
      articleBody.classList.add('font-sm');
      fontBtns.forEach(b => b?.classList.remove('active'));
      decBtn.classList.add('active');
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      articleBody.classList.remove('font-sm', 'font-lg');
      articleBody.classList.add('font-md');
      fontBtns.forEach(b => b?.classList.remove('active'));
      resetBtn.classList.add('active');
    });
  }

  if (incBtn) {
    incBtn.addEventListener('click', () => {
      articleBody.classList.remove('font-sm', 'font-md');
      articleBody.classList.add('font-lg');
      fontBtns.forEach(b => b?.classList.remove('active'));
      incBtn.classList.add('active');
    });
  }
}

/* Nav Tab Switching */
function initNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const views = document.querySelectorAll('.view-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.target;

      tabs.forEach(t => t.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));

      tab.classList.add('active');
      const targetView = document.getElementById(targetId);
      if (targetView) targetView.classList.add('active');

      if (targetId === 'vocab-view') {
        renderVocabularyGrid();
      } else if (targetId === 'study-view') {
        initFlashcards();
        initQuiz();
      }

      hidePopover();
      stopKaraokeReading();
    });
  });

  const emptyGoReaderBtn = document.getElementById('empty-go-reader');
  if (emptyGoReaderBtn) {
    emptyGoReaderBtn.addEventListener('click', () => {
      document.getElementById('nav-reader-btn').click();
    });
  }
}

/* Study Sub-Tabs (Flashcards vs Quiz) */
function initStudyTab() {
  const subTabs = document.querySelectorAll('.study-sub-tab');
  const subPanels = document.querySelectorAll('.study-panel');

  subTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const sub = tab.dataset.sub;

      subTabs.forEach(t => t.classList.remove('active'));
      subPanels.forEach(p => {
        p.classList.remove('active');
        p.classList.add('hidden');
      });

      tab.classList.add('active');
      const panel = document.getElementById(`sub-${sub}`);
      if (panel) {
        panel.classList.remove('hidden');
        panel.classList.add('active');
      }

      if (sub === 'flashcards') {
        initFlashcards();
      } else if (sub === 'quiz') {
        initQuiz();
      }
    });
  });
}

/* Import Mode Selector Tabs */
function initModeSelector() {
  const modeBtns = document.querySelectorAll('.mode-btn');
  const modePanels = document.querySelectorAll('.mode-panel');

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;

      modeBtns.forEach(b => b.classList.remove('active'));
      modePanels.forEach(p => p.classList.add('hidden'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(`mode-${mode}`);
      if (targetPanel) {
        targetPanel.classList.remove('hidden');
        targetPanel.classList.add('active');
      }
    });
  });
}

let allFetchedArticles = [];
let activeNewsCategory = 'all';
let activeNewsLevel = 'all';

/* Live Auto-Updating News Feed Controller */
async function initNewsFeed() {
  const gridEl = document.getElementById('news-feed-grid');
  const loadingEl = document.getElementById('news-loading');
  const refreshBtn = document.getElementById('refresh-news-btn');
  const catPills = document.querySelectorAll('.cat-pill');
  const levelSelect = document.getElementById('news-level-select');
  const countEl = document.getElementById('news-filter-count');
  let feedRequestId = 0;

  if (!gridEl) return;

  levelSelect.addEventListener('change', () => {
    activeNewsLevel = levelSelect.value;
    renderNewsGrid();
  });
  document.getElementById('reset-news-filters').addEventListener('click', () => {
    levelSelect.value = 'all';
    activeNewsLevel = 'all';
    document.querySelector('[data-cat="all"]').click();
  });

  catPills.forEach(pill => {
    pill.addEventListener('click', () => {
      catPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeNewsCategory = pill.dataset.cat;
      renderNewsGrid();
    });
  });

  async function loadFeed() {
    const requestId = ++feedRequestId;
    loadingEl.classList.remove('hidden');
    countEl.textContent = 'Pobieranie artykułów…';
    gridEl.innerHTML = '';

    const articles = await fetchLiveNewsFeed();
    if (requestId !== feedRequestId) return;
    allFetchedArticles = articles.map(article => ({...article, difficulty: estimateDifficulty(`${article.title}. ${article.description || ''}`)}));
    loadingEl.classList.add('hidden');

    renderNewsGrid();
  }

  function renderNewsGrid() {
    gridEl.innerHTML = '';

    const filtered = filterNewsArticles(allFetchedArticles, activeNewsCategory, activeNewsLevel);
    countEl.textContent = `Pasujące artykuły: ${filtered.length} z ${allFetchedArticles.length}`;

    if (filtered.length === 0) {
      gridEl.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><p>Brak artykułów dla wybranych filtrów. Zmień poziom lub kategorię, użyj „Wyczyść filtry” albo odśwież feed.</p></div>`;
      return;
    }

    const INITIAL_SHOW = 6;
    const initialArticles = filtered.slice(0, INITIAL_SHOW);
    const hiddenArticles = filtered.slice(INITIAL_SHOW);

    // Render initial articles (first 6)
    initialArticles.forEach(article => {
      gridEl.appendChild(createNewsCard(article));
    });

    // If there are more articles, render expanded container & toggle button
    if (hiddenArticles.length > 0) {
      const expandedContainer = document.createElement('div');
      expandedContainer.className = 'news-grid-expanded hidden';
      expandedContainer.id = 'news-grid-expanded';

      hiddenArticles.forEach(article => {
        expandedContainer.appendChild(createNewsCard(article));
      });

      gridEl.appendChild(expandedContainer);

      const expandBtnWrapper = document.createElement('div');
      expandBtnWrapper.className = 'expand-news-wrapper';
      expandBtnWrapper.style.cssText = 'grid-column: 1/-1; display: flex; justify-content: center; margin-top: 1rem; margin-bottom: 0.5rem;';

      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'btn-expand-article';
      expandBtn.innerHTML = `📰 Pokaż więcej artykułów (+${hiddenArticles.length} pozostałych wiadomości) 👇`;

      expandBtn.addEventListener('click', () => {
        const isHidden = expandedContainer.classList.contains('hidden');
        if (isHidden) {
          expandedContainer.classList.remove('hidden');
          expandBtn.innerHTML = `🔼 Zwiń listę artykułów`;
          expandBtn.classList.add('expanded');
        } else {
          expandedContainer.classList.add('hidden');
          expandBtn.innerHTML = `📰 Pokaż więcej artykułów (+${hiddenArticles.length} pozostałych wiadomości) 👇`;
          expandBtn.classList.remove('expanded');
          gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      expandBtnWrapper.appendChild(expandBtn);
      gridEl.appendChild(expandBtnWrapper);
    }
  }

  function createNewsCard(article) {
    const card = document.createElement('div');
    card.className = 'library-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Otwórz: ${article.title}`);
    card.innerHTML = `
      <div>
        <div class="news-card-header">
          <span class="news-source-badge" style="background-color:${article.badge_color}">${escapeHtml(article.source)}</span>
          <span class="preset-tag">${escapeHtml(article.category)}</span>
        </div>
        <h4 class="preset-title">${escapeHtml(article.title)}</h4>
        <p class="preset-excerpt">${escapeHtml(article.description || article.title)}</p>
        <span class="news-level-badge" title="Orientacyjna ocena na podstawie zajawki">${escapeHtml(article.difficulty.label)}${article.difficulty.level === 'unknown' ? '' : ' · orientacyjnie'}</span>
      </div>
      <div class="news-time">🌐 Click to read full article</div>
    `;

    card.addEventListener('click', () => {
      loadNewsArticleIntoReader(article);
    });
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); }
    });

    return card;
  }

  refreshBtn.addEventListener('click', () => {
    loadFeed();
  });

  // The home navigation opens News on every visit and refresh.
  document.querySelector('[data-mode="news"]').addEventListener('click', () => { if(!window.wordclickNewsLoaded){window.wordclickNewsLoaded=true;loadFeed();} });
}

let readerRequestId=0;
async function loadNewsArticleIntoReader(article) {
  const requestId=++readerRequestId;
  const readerContainer = document.getElementById('interactive-container');
  const articleBody = document.getElementById('interactive-text-body');
  const displayTitle = document.getElementById('article-display-title');
  const metaInfo = document.getElementById('article-meta-info');

  displayTitle.textContent = article.title;
  displayTitle.classList.remove('hidden');
  metaInfo.textContent = `Live News from ${article.source} • Click any word for translation`;

  let cleanTextToRead = null;

  // Attempt URL scraper first
  try {
    const fetched = await fetchArticleFromUrl(article.link);
    if (fetched && !fetched.is_blocked && fetched.content && fetched.content.length > 80) {
      const lower = fetched.content.toLowerCase();
      if (!lower.includes('accept all') && !lower.includes('we use cookies') && !lower.includes('cookies and data')) {
        cleanTextToRead = fetched.content;
      }
    }
  } catch (e) {
    console.log('Falling back to clean RSS summary:', e);
  }

  // Fallback to title + clean RSS description if scraper blocked or cookie consent page
  if (!cleanTextToRead) {
    cleanTextToRead = `${article.title}.\n\n${article.description || article.title}`;
  }

  if(requestId!==readerRequestId)return;
  metaInfo.textContent = `Live News from ${article.source} • ${difficultyDescription(cleanTextToRead)} • Click any word for translation`;
  renderInteractiveText(cleanTextToRead, articleBody, handleWordClick);
  readerContainer.classList.remove('hidden');
  readerContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* URL Importer Handler */
function initUrlImporter() {
  const urlInput = document.getElementById('url-input');
  const importBtn = document.getElementById('import-url-btn');
  const loadingEl = document.getElementById('url-loading');
  const readerContainer = document.getElementById('interactive-container');
  const articleBody = document.getElementById('interactive-text-body');
  const displayTitle = document.getElementById('article-display-title');
  const metaInfo = document.getElementById('article-meta-info');

  importBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      alert('Please enter a valid webpage URL (e.g. https://en.wikipedia.org/wiki/...)');
      return;
    }

    loadingEl.classList.remove('hidden');
    importBtn.disabled = true;
    const requestId=++readerRequestId;

    try {
      const article = await fetchArticleFromUrl(url);
      if(requestId!==readerRequestId)return;

      if (article.title) {
        displayTitle.textContent = article.title;
        displayTitle.classList.remove('hidden');
      } else {
        displayTitle.classList.add('hidden');
      }

      metaInfo.textContent = `Imported from ${article.domain || 'web'} • ${article.word_count || 0} words • ${difficultyDescription(article.content)} • Click any word for translation`;

      renderInteractiveText(article.content, articleBody, handleWordClick);
      readerContainer.classList.remove('hidden');
      readerContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      alert(`Could not import article: ${err.message}`);
    } finally {
      loadingEl.classList.add('hidden');
      importBtn.disabled = false;
    }
  });
}

/* Manual Paste Handlers */
function initInputHandlers() {
  const textInput = document.getElementById('text-input');
  const loadExampleBtn = document.getElementById('load-example-btn');
  const analyzeBtn = document.getElementById('analyze-btn');
  const clearReaderBtn = document.getElementById('clear-reader-btn');
  const readerContainer = document.getElementById('interactive-container');
  const articleBody = document.getElementById('interactive-text-body');
  const displayTitle = document.getElementById('article-display-title');
  const metaInfo = document.getElementById('article-meta-info');

  textInput.value = DEFAULT_PASTE_EXAMPLE;
  updateWordCounter(DEFAULT_PASTE_EXAMPLE);

  textInput.addEventListener('input', () => {
    updateWordCounter(textInput.value);
  });

  document.getElementById('text-file-input').addEventListener('change', async event => {
    const file=event.target.files[0]; if(!file)return;
    if(file.size>100000){showAccountMessage('Wybierz plik TXT mniejszy niż 100 KB.',true);return;}
    try { textInput.value=await file.text();updateWordCounter(textInput.value);analyzeText(); }
    catch {showAccountMessage('Nie udało się otworzyć pliku.',true);}
    event.target.value='';
  });
  loadExampleBtn.addEventListener('click', () => {
    textInput.value = DEFAULT_PASTE_EXAMPLE;
    updateWordCounter(DEFAULT_PASTE_EXAMPLE);
    analyzeText();
  });

  analyzeBtn.addEventListener('click', () => {
    analyzeText();
  });

  clearReaderBtn.addEventListener('click', () => {
    readerContainer.classList.add('hidden');
    stopKaraokeReading();
  });

  function analyzeText() {
    const text = textInput.value.trim();
    if (!text) {
      alert('Please paste or type an English text first.');
      return;
    }

    readerRequestId++;
    displayTitle.classList.add('hidden');
    metaInfo.textContent = `${difficultyDescription(text)} • Click any word or phrasal verb for instant Polish translation`;

    renderInteractiveText(text, articleBody, handleWordClick);
    readerContainer.classList.remove('hidden');
    readerContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* Featured Article Presets */
function initLibraryHandlers() {
  const libraryCards = document.querySelectorAll('.library-card');
  const readerContainer = document.getElementById('interactive-container');
  const articleBody = document.getElementById('interactive-text-body');
  const displayTitle = document.getElementById('article-display-title');
  const metaInfo = document.getElementById('article-meta-info');

  libraryCards.forEach(card => {
    card.addEventListener('click', () => {
      const presetKey = card.dataset.preset;
      const preset = PRESETS[presetKey];
      if (!preset) return;

      displayTitle.textContent = preset.title;
      displayTitle.classList.remove('hidden');
      metaInfo.textContent = `Featured Article • ${difficultyDescription(preset.content)} • Click any word or phrasal verb for translation`;

      renderInteractiveText(preset.content, articleBody, handleWordClick);
      readerContainer.classList.remove('hidden');
      readerContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* Word Click Flow */
let translationRequestId=0;
async function handleWordClick(eventData) {
  const { word, sentence, wordOffset, element } = eventData;
  showPopoverLoading(element);
  const clickId=++translationRequestId;
  try {
    const translationData = await requestTranslation(word, sentence, wordOffset);
    if(clickId===translationRequestId && element.classList.contains('active-word'))updatePopoverContent(translationData);
  } catch(error) {
    if(clickId===translationRequestId && element.classList.contains('active-word')){
      showPopoverError(error.message,()=>handleWordClick(eventData));
      showAccountMessage(error.message,true);
    }
  }
}

function updateWordCounter(text) {
  const counterEl = document.getElementById('input-word-counter');
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  counterEl.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
}

/* Vocabulary Handlers */
function initVocabHandlers() {
  const searchInput = document.getElementById('vocab-search');
  const clearBtn = document.getElementById('clear-vocab-btn');

  searchInput.addEventListener('input', () => {
    renderVocabularyGrid(searchInput.value.trim());
  });

  clearBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all saved vocabulary?')) {
      try { await clearAllVocabulary();renderVocabularyGrid(); } catch(error){showAccountMessage(error.message,true);}
    }
  });
}

function renderVocabularyGrid(filterQuery = '') {
  const gridEl = document.getElementById('vocab-grid');
  const emptyEl = document.getElementById('vocab-empty');
  let items = getSavedVocabulary();

  if (filterQuery) {
    const q = filterQuery.toLowerCase();
    items = items.filter(item => 
      item.word.toLowerCase().includes(q) ||
      item.translation.toLowerCase().includes(q)
    );
  }

  gridEl.innerHTML = '';

  if (items.length === 0) {
    emptyEl.classList.remove('hidden');
    gridEl.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  gridEl.classList.remove('hidden');

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'vocab-card';
    card.innerHTML = `
      <div>
        <div class="vocab-card-header">
          <span class="vocab-card-word">${escapeHtml(item.word)}</span>
          ${item.is_phrase ? `<span class="badge-phrase">🏷️ Phrase</span>` : ''}
          ${item.pronunciation ? `<span class="pop-ipa">${escapeHtml(item.pronunciation)}</span>` : ''}
        </div>
        <div class="vocab-card-translation">🇵🇱 ${escapeHtml(item.translation)}</div>
        ${item.context_example ? `<div class="vocab-card-example">"${escapeHtml(item.context_example)}"</div>` : ''}
      </div>
      <div class="vocab-card-footer">
        <span class="vocab-card-date">${escapeHtml(item.dateAdded)}</span>
        <div style="display:flex; gap: 8px; align-items:center;">
          <button class="btn-subtle btn-vocab-audio" data-word="${escapeHtml(item.word)}" title="Play audio">
            🔊 Listen
          </button>
          <button class="btn-remove-vocab" data-id="${item.id}" title="Remove word">
            Remove
          </button>
        </div>
      </div>
    `;

    card.querySelector('.btn-vocab-audio').addEventListener('click', (e) => {
      e.stopPropagation();
      playWordAudio(item.word);
    });

    card.querySelector('.btn-remove-vocab').addEventListener('click', async (e) => {
      e.stopPropagation();
      try { await removeWordFromVocabulary(item.id);renderVocabularyGrid(filterQuery); } catch(error){showAccountMessage(error.message,true);}
    });

    gridEl.appendChild(card);
  });
}

function updateVocabBadge() {
  const badge = document.getElementById('vocab-count-badge');
  const count = getSavedVocabulary().length;
  badge.textContent = count;
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
