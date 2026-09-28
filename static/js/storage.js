/**
 * LocalStorage Vocabulary Persistence Manager
 */
const STORAGE_KEY = 'wordclick_v2_vocabulary';

export function getSavedVocabulary() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Error reading localStorage vocabulary:', e);
    return [];
  }
}

export function saveWordToVocabulary(wordItem) {
  const list = getSavedVocabulary();
  const key = (wordItem.phrase || wordItem.clean_word || wordItem.word).toLowerCase();
  
  const existingIndex = list.findIndex(item => 
    (item.phrase || item.clean_word || item.word).toLowerCase() === key
  );

  const newItem = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    word: wordItem.phrase || wordItem.word,
    clean_word: wordItem.clean_word || wordItem.word,
    is_phrase: wordItem.is_phrase || false,
    translation: wordItem.translation,
    pronunciation: wordItem.pronunciation || '',
    context_example: wordItem.context_example || '',
    context_example_pl: wordItem.context_example_pl || '',
    dateAdded: new Date().toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  };

  if (existingIndex >= 0) {
    list[existingIndex] = newItem;
  } else {
    list.unshift(newItem);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  dispatchVocabChangeEvent();
  return newItem;
}

export function removeWordFromVocabulary(cleanWordOrId) {
  let list = getSavedVocabulary();
  const targetKey = cleanWordOrId.toLowerCase();

  list = list.filter(item => 
    item.id !== cleanWordOrId &&
    (item.phrase || item.clean_word || item.word).toLowerCase() !== targetKey
  );

  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  dispatchVocabChangeEvent();
}

export function isWordSaved(word) {
  if (!word) return false;
  const list = getSavedVocabulary();
  const key = word.toLowerCase();
  return list.some(item => (item.phrase || item.clean_word || item.word).toLowerCase() === key);
}

export function clearAllVocabulary() {
  localStorage.removeItem(STORAGE_KEY);
  dispatchVocabChangeEvent();
}

function dispatchVocabChangeEvent() {
  window.dispatchEvent(new CustomEvent('vocab-changed', {
    detail: { count: getSavedVocabulary().length }
  }));
}
