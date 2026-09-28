/**
 * Sentence-by-Sentence Karaoke TTS Engine for Chromium, Edge & Firefox
 */

import { getBestVoice, populateVoiceSelector } from './speech.js';

let currentSentenceIndex = 0;
let sentenceList = [];
let isPlaying = false;
let isPaused = false;
let currentSpeed = 1.0;

export function initKaraokePlayer() {
  const playBtn = document.getElementById('karaoke-play-btn');
  const pauseBtn = document.getElementById('karaoke-pause-btn');
  const stopBtn = document.getElementById('karaoke-stop-btn');
  const speedSelect = document.getElementById('karaoke-speed-select');
  const voiceSelect = document.getElementById('karaoke-voice-select');

  if (!playBtn) return;

  playBtn.addEventListener('click', startKaraokeReading);
  pauseBtn.addEventListener('click', pauseKaraokeReading);
  stopBtn.addEventListener('click', stopKaraokeReading);

  if (speedSelect) {
    speedSelect.addEventListener('change', (e) => {
      currentSpeed = parseFloat(e.target.value);
      if (isPlaying) {
        stopKaraokeReading();
        startKaraokeReading();
      }
    });
  }

  if (voiceSelect) {
    populateVoiceSelector(voiceSelect);
    voiceSelect.addEventListener('change', () => {
      if (isPlaying) {
        stopKaraokeReading();
        startKaraokeReading();
      }
    });
  }

  // Ensure voices are loaded
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
        if (voiceSelect) populateVoiceSelector(voiceSelect);
      };
    }
  }
}

export function startKaraokeReading() {
  if (!('speechSynthesis' in window)) {
    alert('Speech synthesis is not supported in this browser.');
    return;
  }

  const playBtn = document.getElementById('karaoke-play-btn');
  const pauseBtn = document.getElementById('karaoke-pause-btn');
  const stopBtn = document.getElementById('karaoke-stop-btn');

  if (isPaused && window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    isPaused = false;
    isPlaying = true;
    if (playBtn) playBtn.classList.add('hidden');
    if (pauseBtn) pauseBtn.classList.remove('hidden');
    return;
  }

  window.speechSynthesis.cancel();
  clearKaraokeHighlights();

  const tokenEls = Array.from(document.querySelectorAll('.word-token'));
  if (tokenEls.length === 0) {
    alert('Please load an article or paste text first.');
    return;
  }

  sentenceList = buildSentenceTokenMap(tokenEls);
  if (sentenceList.length === 0) return;

  currentSentenceIndex = 0;
  isPlaying = true;
  isPaused = false;

  if (playBtn) playBtn.classList.add('hidden');
  if (pauseBtn) pauseBtn.classList.remove('hidden');
  if (stopBtn) stopBtn.classList.remove('hidden');

  speakNextSentence();
}

function speakNextSentence() {
  if (!isPlaying || currentSentenceIndex >= sentenceList.length) {
    stopKaraokeReading();
    return;
  }

  const item = sentenceList[currentSentenceIndex];
  
  clearKaraokeHighlights();
  item.tokens.forEach(el => el.classList.add('speaking'));
  if (item.tokens[0]) {
    item.tokens[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const utterance = new SpeechSynthesisUtterance(item.text);
  utterance.lang = 'en-US';
  utterance.rate = currentSpeed;

  const voiceSelect = document.getElementById('karaoke-voice-select');
  const selectedVoiceName = voiceSelect ? voiceSelect.value : null;
  const voice = getBestVoice(selectedVoiceName);
  
  if (voice) {
    utterance.voice = voice;
  }

  utterance.onend = () => {
    currentSentenceIndex++;
    if (isPlaying) {
      speakNextSentence();
    }
  };

  utterance.onerror = (e) => {
    console.warn('Utterance error:', e);
    currentSentenceIndex++;
    if (isPlaying) {
      speakNextSentence();
    }
  };

  window.speechSynthesis.speak(utterance);
}

export function pauseKaraokeReading() {
  const playBtn = document.getElementById('karaoke-play-btn');
  const pauseBtn = document.getElementById('karaoke-pause-btn');

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
    isPaused = true;
    isPlaying = false;
    if (playBtn) playBtn.classList.remove('hidden');
    if (pauseBtn) pauseBtn.classList.add('hidden');
  }
}

export function stopKaraokeReading() {
  const playBtn = document.getElementById('karaoke-play-btn');
  const pauseBtn = document.getElementById('karaoke-pause-btn');
  const stopBtn = document.getElementById('karaoke-stop-btn');

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  isPlaying = false;
  isPaused = false;
  clearKaraokeHighlights();

  if (playBtn) playBtn.classList.remove('hidden');
  if (pauseBtn) pauseBtn.classList.add('hidden');
  if (stopBtn) stopBtn.classList.add('hidden');
}

function clearKaraokeHighlights() {
  document.querySelectorAll('.word-token.speaking').forEach(el => {
    el.classList.remove('speaking');
  });
}

function buildSentenceTokenMap(tokenEls) {
  const sentences = [];
  let currentTokens = [];
  let currentText = '';

  tokenEls.forEach((el, index) => {
    currentTokens.push(el);
    currentText += el.textContent + ' ';

    const sentenceAttr = el.dataset.sentence || '';
    const isEnd = index === tokenEls.length - 1 || 
                  (sentenceAttr && index < tokenEls.length - 1 && tokenEls[index + 1].dataset.sentence !== sentenceAttr);

    if (isEnd) {
      if (currentTokens.length > 0) {
        sentences.push({
          text: currentText.trim(),
          tokens: [...currentTokens]
        });
      }
      currentTokens = [];
      currentText = '';
    }
  });

  return sentences;
}
