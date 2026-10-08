/** Local readability estimate, not a certified CEFR assessment.
 * Feed excerpts and full articles are assessed separately; no user text leaves
 * the browser for this feature. Numbers and URLs are excluded from word counts.
 */
export const DIFFICULTY_LEVELS = {
  basic: 'Podstawowy (A1–A2)',
  intermediate: 'Średniozaawansowany (B1–B2)',
  advanced: 'Zaawansowany (C1–C2)',
  unknown: 'Brak oceny'
};

export function estimateDifficulty(text) {
  const clean = String(text || '').replace(/https?:\/\/\S+/g, ' ').slice(0, 100000);
  const words = clean.match(/[a-z]+(?:['’][a-z]+)?/gi) || [];
  if (words.length < 30) return { level: 'unknown', label: DIFFICULTY_LEVELS.unknown };
  const sentences = clean.match(/[^.!?]+(?:[.!?]+|$)/g) || [clean];
  const sentenceCount = sentences.filter(s => /[a-z]/i.test(s)).length || 1;
  const syllables = words.reduce((total, word) => {
    let w = word.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    return total + Math.max(1, (w.match(/[aeiouy]+/g) || []).length);
  }, 0);
  // Readability grade combines sentence length and syllables per word.
  // Broad bands avoid pretending to distinguish individual CEFR levels.
  const grade = 0.39 * (words.length / sentenceCount) + 11.8 * (syllables / words.length) - 15.59;
  const level = grade < 6 ? 'basic' : grade < 12 ? 'intermediate' : 'advanced';
  return { level, label: DIFFICULTY_LEVELS[level] };
}

export function filterNewsArticles(articles, category, level) {
  return articles.filter(article =>
    (category === 'all' || article.category === category) &&
    (level === 'all' || article.difficulty.level === level));
}

export function difficultyDescription(text) {
  const result = estimateDifficulty(text);
  return result.level === 'unknown' ? 'Brak oceny poziomu: za mało tekstu' : `Poziom orientacyjny: ${result.label}`;
}
