/**
 * SuperMemo SM-2 Spaced Repetition (SRS) & Interactive Quiz Engine (with Card Navigation Controls)
 */

import { getSavedVocabulary, saveWordToVocabulary, showAccountMessage } from './storage.js';
import { playWordAudio } from './speech.js';

let flashcardItems = [];
let currentCardIndex = 0;
let quizQuestions = [];
let currentQuizIndex = 0;
let quizScore = 0;

export function calculateSM2(item, grade) {
  let repetitions = item.repetitions || 0;
  let easeFactor = item.easeFactor || 2.5;
  let interval = item.interval || 1;

  if (grade >= 3) {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = (grade === 5) ? 6 : 3;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    repetitions = 0;
    interval = 1;
  }

  easeFactor = easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return {
    repetitions,
    easeFactor,
    interval,
    nextReviewDate: nextReviewDate.toISOString().split('T')[0]
  };
}

/* Flashcards UI Controller */
export function initFlashcards() {
  const container = document.getElementById('flashcard-container');
  const emptyEl = document.getElementById('flashcard-empty');
  const cardEl = document.getElementById('flashcard-3d');
  const audioBtn = document.getElementById('fc-audio-btn');
  const prevBtn = document.getElementById('fc-prev-btn');
  const nextBtn = document.getElementById('fc-next-btn');

  flashcardItems = getSavedVocabulary();

  if (flashcardItems.length === 0) {
    emptyEl.classList.remove('hidden');
    container.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  container.classList.remove('hidden');

  currentCardIndex = 0;
  renderCurrentFlashcard();

  cardEl.onclick = (e) => {
    if (e.target.closest('.fc-audio-btn') || e.target.closest('.btn-srs') || e.target.closest('.fc-nav-btn')) return;
    cardEl.classList.toggle('flipped');
  };

  if (audioBtn) {
    audioBtn.onclick = (e) => {
      e.stopPropagation();
      const item = flashcardItems[currentCardIndex];
      if (item) playWordAudio(item.word);
    };
  }

  // Prev / Next Navigation Buttons
  if (prevBtn) {
    prevBtn.onclick = (e) => {
      e.stopPropagation();
      cardEl.classList.remove('flipped');
      setTimeout(() => {
        currentCardIndex = (currentCardIndex - 1 + flashcardItems.length) % flashcardItems.length;
        renderCurrentFlashcard();
      }, 150);
    };
  }

  if (nextBtn) {
    nextBtn.onclick = (e) => {
      e.stopPropagation();
      cardEl.classList.remove('flipped');
      setTimeout(() => {
        currentCardIndex = (currentCardIndex + 1) % flashcardItems.length;
        renderCurrentFlashcard();
      }, 150);
    };
  }

  // Keyboard navigation (← and →)
  document.onkeydown = (e) => {
    const studyTabActive = document.getElementById('study-view')?.classList.contains('active');
    const subFlashcardsActive = document.getElementById('sub-flashcards')?.classList.contains('active');
    if (studyTabActive && subFlashcardsActive && flashcardItems.length > 0) {
      if (e.key === 'ArrowLeft') {
        if (prevBtn) prevBtn.click();
      } else if (e.key === 'ArrowRight') {
        if (nextBtn) nextBtn.click();
      }
    }
  };

  // Rating buttons listener
  document.querySelectorAll('.btn-srs').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const grade = parseInt(btn.dataset.grade, 10);
      const item = flashcardItems[currentCardIndex];
      
      if (item) {
        const sm2Result = calculateSM2(item, grade);
        btn.disabled=true;
        try { await saveWordToVocabulary({...item,...sm2Result});Object.assign(item, sm2Result); }
        catch(error){showAccountMessage(error.message,true);return;}
        finally{btn.disabled=false;}
      }

      cardEl.classList.remove('flipped');
      setTimeout(() => {
        currentCardIndex = (currentCardIndex + 1) % flashcardItems.length;
        renderCurrentFlashcard();
      }, 200);
    };
  });
}

function renderCurrentFlashcard() {
  const frontWord = document.getElementById('fc-front-word');
  const frontExample = document.getElementById('fc-front-example');
  const backWord = document.getElementById('fc-back-word');
  const backTranslation = document.getElementById('fc-back-translation');
  const backExamplePl = document.getElementById('fc-back-example-pl');
  const counterEl = document.getElementById('fc-counter');

  if (flashcardItems.length === 0) return;

  const item = flashcardItems[currentCardIndex];
  counterEl.textContent = `Card ${currentCardIndex + 1} of ${flashcardItems.length}`;

  frontWord.textContent = item.word;
  frontExample.textContent = item.context_example ? `"${item.context_example}"` : `"${item.word}"`;

  backWord.textContent = item.word;
  backTranslation.textContent = item.translation;
  backExamplePl.textContent = item.context_example_pl ? `→ ${item.context_example_pl}` : '';
}

const FALLBACK_DISTRACTORS = ['upcoming', 'alignment', 'challenge', 'implementation', 'meeting', 'discussion', 'strategy', 'decision', 'priority'];

/* Context Quiz Controller */
export function initQuiz() {
  const quizContainer = document.getElementById('quiz-container');
  const emptyEl = document.getElementById('quiz-empty');

  const items = getSavedVocabulary();
  if (items.length < 1) {
    emptyEl.classList.remove('hidden');
    quizContainer.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  quizContainer.classList.remove('hidden');

  quizQuestions = items.map(item => {
    const wordTarget = item.word;
    let sentence = item.context_example || `Example with ${wordTarget}`;
    
    const regex = new RegExp(`\\b(${escapeRegExp(wordTarget)})\\b`, 'gi');
    const blankSentence = sentence.replace(regex, '________');

    const otherWords = items
      .filter(i => i.word.toLowerCase() !== wordTarget.toLowerCase())
      .map(i => i.word);
    
    const distractors = [...otherWords, ...FALLBACK_DISTRACTORS.filter(d => d.toLowerCase() !== wordTarget.toLowerCase())];
    shuffleArray(distractors);

    const options = [wordTarget, ...distractors.slice(0, 3)];
    shuffleArray(options);

    return {
      word: wordTarget,
      blankSentence,
      translation: item.translation,
      options
    };
  });

  currentQuizIndex = 0;
  quizScore = 0;
  renderCurrentQuizQuestion();
}

function renderCurrentQuizQuestion() {
  const questionEl = document.getElementById('quiz-question-sentence');
  const optionsEl = document.getElementById('quiz-options-grid');
  const counterEl = document.getElementById('quiz-counter');
  const scoreEl = document.getElementById('quiz-score');
  const feedbackEl = document.getElementById('quiz-feedback');

  if (currentQuizIndex >= quizQuestions.length) {
    questionEl.textContent = `🎉 Quiz Completed! You scored ${quizScore} out of ${quizQuestions.length}!`;
    optionsEl.replaceChildren();const restart=document.createElement('button');restart.className='btn-primary';restart.textContent='Try Again';restart.onclick=initQuiz;optionsEl.appendChild(restart);
    feedbackEl.classList.add('hidden');
    return;
  }

  const q = quizQuestions[currentQuizIndex];
  counterEl.textContent = `Question ${currentQuizIndex + 1} of ${quizQuestions.length}`;
  scoreEl.textContent = `Score: ${quizScore}`;
  feedbackEl.classList.add('hidden');

  questionEl.innerHTML = `"${escapeHtml(q.blankSentence)}" <div style="font-size:0.9rem; color:#6366f1; margin-top:6px;">(Polish: ${escapeHtml(q.translation)})</div>`;

  optionsEl.innerHTML = '';
  q.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option-btn';
    btn.textContent = opt;
    btn.onclick = () => handleQuizAnswer(opt, q.word, btn);
    optionsEl.appendChild(btn);
  });
}

function handleQuizAnswer(selectedOption, correctWord, buttonElement) {
  const allBtns = document.querySelectorAll('.quiz-option-btn');
  allBtns.forEach(b => b.disabled = true);

  const feedbackEl = document.getElementById('quiz-feedback');

  if (selectedOption.toLowerCase() === correctWord.toLowerCase()) {
    buttonElement.classList.add('correct');
    quizScore++;
    feedbackEl.textContent = '✓ Correct!';
    feedbackEl.className = 'quiz-feedback correct';
  } else {
    buttonElement.classList.add('wrong');
    feedbackEl.textContent = `✕ Incorrect. Answer: ${correctWord}`;
    feedbackEl.className = 'quiz-feedback wrong';
    
    allBtns.forEach(b => {
      if (b.textContent.toLowerCase() === correctWord.toLowerCase()) {
        b.classList.add('correct');
      }
    });
  }

  feedbackEl.classList.remove('hidden');

  setTimeout(() => {
    currentQuizIndex++;
    renderCurrentQuizQuestion();
  }, 1600);
}

window.restartQuiz = () => {
  initQuiz();
};

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function escapeRegExp(string) {
  return (string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
