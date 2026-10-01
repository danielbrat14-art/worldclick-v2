/**
 * Popover & Mobile Bottom Sheet UI Controller (with Grammar Insights Support)
 */
import { playWordAudio } from './speech.js';
import { saveWordToVocabulary, removeWordFromVocabulary, isWordSaved, showAccountMessage, isSignedIn } from './storage.js';
import { detectGrammarInsights } from './grammar.js';

let currentTranslationData = null;

export function initPopover() {
  const popoverEl = document.getElementById('word-popover');
  const backdropEl = document.getElementById('popover-backdrop');
  const closeBtn = document.getElementById('pop-close-btn');
  const audioBtn = document.getElementById('pop-audio-btn');
  const addVocabBtn = document.getElementById('pop-add-vocab-btn');

  backdropEl.addEventListener('click', hidePopover);
  closeBtn.addEventListener('click', hidePopover);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popoverEl.classList.contains('hidden')) {
      hidePopover();
    }
  });

  audioBtn.addEventListener('click', () => {
    if (!currentTranslationData) return;
    const textToSpeak = currentTranslationData.phrase || currentTranslationData.word;
    audioBtn.classList.add('playing');
    playWordAudio(textToSpeak, () => {
      audioBtn.classList.remove('playing');
    });
  });

  addVocabBtn.addEventListener('click', async () => {
    if (!currentTranslationData || addVocabBtn.disabled) return;
    if(!isSignedIn()){
      // Keep the selected text and translation visible; sign-in is a deliberate
      // top-level link, and the public reader does not redirect unexpectedly.
      showAccountMessage('Zaloguj się przyciskiem u góry, aby zapisać słowo w swojej bibliotece.',true);
      const signIn=document.getElementById('account-signin');
      if(!signIn.classList.contains('hidden')){
        signIn.focus();
        signIn.scrollIntoView({behavior:'smooth',block:'center'});
      }else showAccountMessage('Logowanie Google jest w przygotowaniu. Słowo nie zostało zapisane.',true);
      return;
    }
    const snapshot=currentTranslationData;
    const cleanKey=snapshot.phrase || snapshot.clean_word || snapshot.word;
    addVocabBtn.disabled=true;
    try {
      if(isWordSaved(cleanKey,snapshot))await removeWordFromVocabulary(cleanKey);
      else await saveWordToVocabulary(snapshot);
      if(currentTranslationData===snapshot)updateVocabButtonState(isWordSaved(cleanKey,snapshot));
    } catch(error) { showAccountMessage(error.message,true); }
    finally {addVocabBtn.disabled=false;}
  });
}

export function showPopoverLoading(targetElement) {
  const popoverEl = document.getElementById('word-popover');
  const loadingEl = document.getElementById('pop-loading');
  const contentEl = document.getElementById('pop-content');
  const wordEl = document.getElementById('pop-word');
  const ipaEl = document.getElementById('pop-ipa');
  const badgeEl = document.getElementById('pop-phrase-badge');
  const grammarBlock = document.getElementById('pop-grammar-group');

  currentTranslationData=null;
  document.getElementById('pop-add-vocab-btn').disabled=true;
  document.getElementById('pop-error').classList.add('hidden');
  wordEl.textContent = targetElement.dataset.word || targetElement.textContent;
  ipaEl.textContent = '';
  if (badgeEl) badgeEl.classList.add('hidden');
  if (grammarBlock) grammarBlock.classList.add('hidden');
  
  loadingEl.classList.remove('hidden');
  contentEl.classList.add('hidden');
  
  popoverEl.classList.remove('hidden');
  positionPopover(targetElement);
}

export function showPopoverError(message, retry) {
  currentTranslationData=null;
  document.getElementById('pop-loading').classList.add('hidden');
  document.getElementById('pop-content').classList.add('hidden');
  document.getElementById('pop-add-vocab-btn').disabled=true;
  document.getElementById('pop-error-message').textContent=message;
  document.getElementById('pop-retry-btn').onclick=retry;
  document.getElementById('pop-error').classList.remove('hidden');
  const target=document.querySelector('.word-token.active-word');
  if(target)positionPopover(target);
}

export function updatePopoverContent(data) {
  currentTranslationData = data;
  document.getElementById('pop-add-vocab-btn').disabled=false;

  const loadingEl = document.getElementById('pop-loading');
  const contentEl = document.getElementById('pop-content');
  const wordEl = document.getElementById('pop-word');
  const ipaEl = document.getElementById('pop-ipa');
  const translationEl = document.getElementById('pop-translation');
  const exampleEnEl = document.getElementById('pop-example-en');
  const examplePlEl = document.getElementById('pop-example-pl');
  const meaningsGroup = document.getElementById('pop-meanings-group');
  const meaningsList = document.getElementById('pop-meanings-list');
  const badgeEl = document.getElementById('pop-phrase-badge');
  const grammarBlock = document.getElementById('pop-grammar-group');

  if (data.is_phrase && data.phrase) {
    wordEl.textContent = data.phrase;
    if (badgeEl) {
      badgeEl.textContent = `🏷️ ${data.phrase_type || 'Phrasal Verb'}`;
      badgeEl.classList.remove('hidden');
    }
  } else {
    wordEl.textContent = data.word;
    if (badgeEl) badgeEl.classList.add('hidden');
  }

  ipaEl.textContent = data.pronunciation || '';
  translationEl.textContent = data.translation || data.word;
  document.getElementById('pop-translation-kind').textContent=data.translation_kind==='contextual'?'Znaczenie w zdaniu':'Znaczenie słownikowe — porównaj ze zdaniem poniżej';

  const highlightTarget = data.phrase || data.word;
  if (data.context_example) {
    const regex = new RegExp(`\\b(${escapeRegExp(highlightTarget)})\\b`, 'gi');
    exampleEnEl.innerHTML = `"${escapeHtml(data.context_example).replace(regex, '<strong>$1</strong>')}"`;
  } else {
    exampleEnEl.textContent = `"${highlightTarget}"`;
  }

  examplePlEl.textContent = data.context_example_pl ? `→ ${data.context_example_pl}` : '';

  if (data.possible_meanings && data.possible_meanings.length > 1) {
    meaningsList.innerHTML = data.possible_meanings
      .map(m => `<li>${escapeHtml(m)}</li>`)
      .join('');
    meaningsGroup.classList.remove('hidden');
  } else {
    meaningsGroup.classList.add('hidden');
  }

  // Grammar Insights Detector
  const grammarInsight = detectGrammarInsights(data.word, data.context_example);
  if (grammarInsight && grammarBlock) {
    grammarBlock.innerHTML = `
      <div class="grammar-header">
        <span class="grammar-title">💡 Grammar Insight: ${escapeHtml(grammarInsight.name)}</span>
      </div>
      <div class="grammar-formula">Wzór: <code>${escapeHtml(grammarInsight.formula)}</code></div>
      <p class="grammar-desc">${escapeHtml(grammarInsight.explanation_pl)}</p>
      <div class="grammar-example">${escapeHtml(grammarInsight.example_pl)}</div>
    `;
    grammarBlock.classList.remove('hidden');
  } else if (grammarBlock) {
    grammarBlock.classList.add('hidden');
  }

  const cleanKey = data.phrase || data.clean_word || data.word;
  updateVocabButtonState(isWordSaved(cleanKey,data));

  loadingEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  const targetEl = document.querySelector('.word-token.active-word');
  if (targetEl) {
    positionPopover(targetEl);
  }
}

export function hidePopover() {
  const popoverEl = document.getElementById('word-popover');
  popoverEl.classList.add('hidden');

  document.querySelectorAll('.word-token.active-word').forEach(el => {
    el.classList.remove('active-word');
  });

  currentTranslationData = null;
}

function updateVocabButtonState(saved) {
  const btn = document.getElementById('pop-add-vocab-btn');
  const textSpan = document.getElementById('pop-add-text');
  const plusIcon = btn.querySelector('.plus-icon');
  const checkIcon = btn.querySelector('.check-icon');

  if (saved) {
    btn.classList.add('saved');
    textSpan.textContent = 'In vocabulary';
    plusIcon.classList.add('hidden');
    checkIcon.classList.remove('hidden');
  } else {
    btn.classList.remove('saved');
    textSpan.textContent = 'Add to vocabulary';
    plusIcon.classList.remove('hidden');
    checkIcon.classList.add('hidden');
  }
}

function positionPopover(targetElement) {
  const card = document.querySelector('.popover-card');
  if (!card || window.innerWidth <= 768) {
    if (card) {
      card.style.top = '';
      card.style.left = '';
    }
    return;
  }

  const rect = targetElement.getBoundingClientRect();
  const cardWidth = 400;
  const cardHeight = Math.min(card.offsetHeight || 380, window.innerHeight - 32);

  let left = rect.left + (rect.width / 2) - (cardWidth / 2);
  left = Math.max(16, Math.min(left, window.innerWidth - cardWidth - 16));

  let top;
  if (rect.top > window.innerHeight / 2) {
    top = rect.top - cardHeight - 12;
  } else {
    top = rect.bottom + 12;
  }

  top = Math.max(16, Math.min(top, window.innerHeight - cardHeight - 16));

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function escapeRegExp(string) {
  return (string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
