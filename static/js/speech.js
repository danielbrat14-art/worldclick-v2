/**
 * High-Quality Text-to-Speech Engine for Words, Phrases & Articles
 * Supports Natural Neural Voices (Google, Microsoft Natural, Apple Enhanced)
 */

let cachedEnglishVoices = [];
const PREFERRED_VOICE_KEY = 'wordclick_preferred_voice';

export function getEnglishVoices() {
  if (!('speechSynthesis' in window)) return [];
  const voices = window.speechSynthesis.getVoices();
  const enVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));

  // Sort natural/neural voices first
  enVoices.sort((a, b) => {
    const isANatural = isNaturalVoice(a);
    const isBNatural = isNaturalVoice(b);
    if (isANatural && !isBNatural) return -1;
    if (!isANatural && isBNatural) return 1;
    return a.name.localeCompare(b.name);
  });

  cachedEnglishVoices = enVoices;
  return enVoices;
}

function isNaturalVoice(voice) {
  if (!voice || !voice.name) return false;
  const name = voice.name;
  return (
    name.includes('Online (Natural)') ||
    name.includes('Natural') ||
    name.includes('Enhanced') ||
    name.includes('Premium') ||
    name.includes('Google US English') ||
    name.includes('Google UK English') ||
    name.includes('Ava') ||
    name.includes('Jenny') ||
    name.includes('Guy') ||
    name.includes('Aria') ||
    name.includes('Samantha') ||
    name.includes('Alex')
  );
}

export function getBestVoice(selectedVoiceName) {
  const voices = cachedEnglishVoices.length > 0 ? cachedEnglishVoices : getEnglishVoices();
  if (voices.length === 0) return null;

  // 1. If user selected a specific voice name, match it
  const userPref = selectedVoiceName || localStorage.getItem(PREFERRED_VOICE_KEY);
  if (userPref) {
    const matched = voices.find(v => v.name === userPref);
    if (matched) return matched;
  }

  // 2. Priority match for natural voices
  const natural = voices.find(v => isNaturalVoice(v));
  if (natural) return natural;

  // 3. Fallback to any English voice
  return voices[0];
}

export function populateVoiceSelector(selectElement) {
  if (!selectElement) return;
  const voices = getEnglishVoices();
  if (voices.length === 0) return;

  const currentPref = localStorage.getItem(PREFERRED_VOICE_KEY);
  selectElement.innerHTML = '';

  voices.forEach(voice => {
    const opt = document.createElement('option');
    opt.value = voice.name;
    const isNat = isNaturalVoice(voice);
    opt.textContent = `${isNat ? '⭐ ' : ''}${voice.name} (${voice.lang})`;
    if (currentPref && voice.name === currentPref) {
      opt.selected = true;
    } else if (!currentPref && isNat && !selectElement.value) {
      opt.selected = true;
    }
    selectElement.appendChild(opt);
  });

  selectElement.addEventListener('change', (e) => {
    localStorage.setItem(PREFERRED_VOICE_KEY, e.target.value);
  });
}

export function playWordAudio(text, onEndCallback) {
  if (!text || !text.trim()) {
    if (onEndCallback) onEndCallback();
    return;
  }

  const cleanText = text.trim();

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;

    const voice = getBestVoice();
    if (voice) {
      utterance.voice = voice;
    }

    let hasEnded = false;
    const finish = () => {
      if (!hasEnded) {
        hasEnded = true;
        if (onEndCallback) onEndCallback();
      }
    };

    utterance.onend = finish;
    utterance.onerror = () => {
      // Fallback to Google TTS Audio Element if WebSpeech fails
      playGoogleTTSFallback(cleanText, finish);
    };

    window.speechSynthesis.speak(utterance);
  } else {
    playGoogleTTSFallback(cleanText, onEndCallback);
  }
}

function playGoogleTTSFallback(text, onEndCallback) {
  try {
    const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
    const audio = new Audio(audioUrl);
    audio.onended = () => { if (onEndCallback) onEndCallback(); };
    audio.onerror = () => { if (onEndCallback) onEndCallback(); };
    audio.play().catch(() => { if (onEndCallback) onEndCallback(); });
  } catch (e) {
    if (onEndCallback) onEndCallback();
  }
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      getEnglishVoices();
      const voiceSelect = document.getElementById('karaoke-voice-select');
      if (voiceSelect) populateVoiceSelector(voiceSelect);
    };
  }
}
