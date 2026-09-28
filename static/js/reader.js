/**
 * Text Tokenizer & Interactive Reader Renderer for WordClick v2
 * Includes Smart Article Truncation & Expand/Collapse Accordion ("Rozwiń więcej")
 */

export function renderInteractiveText(rawText, containerElement, onWordClickCallback) {
  containerElement.innerHTML = '';

  if (!rawText || !rawText.trim()) return;

  const paragraphs = rawText.split(/\n+/).filter(p => p.trim().length > 0);
  const INITIAL_PARAGRAPHS = 3;

  const visibleParagraphs = paragraphs.slice(0, INITIAL_PARAGRAPHS);
  const hiddenParagraphs = paragraphs.slice(INITIAL_PARAGRAPHS);

  // Render initial visible paragraphs
  visibleParagraphs.forEach((paragraphText) => {
    const pEl = createParagraphElement(paragraphText, rawText, onWordClickCallback);
    containerElement.appendChild(pEl);
  });

  // If article has more paragraphs, render accordion "Rozwiń więcej"
  if (hiddenParagraphs.length > 0) {
    // Fade overlay line
    const fadeOverlay = document.createElement('div');
    fadeOverlay.className = 'article-fade-overlay';
    fadeOverlay.id = 'article-fade-overlay';
    containerElement.appendChild(fadeOverlay);

    // Collapsible container for remaining paragraphs
    const expandedContainer = document.createElement('div');
    expandedContainer.className = 'article-expanded-body hidden';
    expandedContainer.id = 'article-expanded-body';

    hiddenParagraphs.forEach((paragraphText) => {
      const pEl = createParagraphElement(paragraphText, rawText, onWordClickCallback);
      expandedContainer.appendChild(pEl);
    });

    containerElement.appendChild(expandedContainer);

    // Expand / Collapse Button
    const btnContainer = document.createElement('div');
    btnContainer.className = 'expand-btn-container';

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'btn-expand-article';
    expandBtn.id = 'btn-toggle-expand-article';
    expandBtn.innerHTML = `📖 Czytaj dalej (Rozwiń pełny artykuł — ${hiddenParagraphs.length} pozostałych akapitów) 👇`;

    expandBtn.addEventListener('click', () => {
      const isCurrentlyHidden = expandedContainer.classList.contains('hidden');
      if (isCurrentlyHidden) {
        expandedContainer.classList.remove('hidden');
        fadeOverlay.classList.add('hidden');
        expandBtn.innerHTML = `🔼 Zwiń artykuł`;
        expandBtn.classList.add('expanded');
      } else {
        expandedContainer.classList.add('hidden');
        fadeOverlay.classList.remove('hidden');
        expandBtn.innerHTML = `📖 Czytaj dalej (Rozwiń pełny artykuł — ${hiddenParagraphs.length} pozostałych akapitów) 👇`;
        expandBtn.classList.remove('expanded');
        containerElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    btnContainer.appendChild(expandBtn);
    containerElement.appendChild(btnContainer);
  }
}

function createParagraphElement(paragraphText, rawText, onWordClickCallback) {
  const pEl = document.createElement('p');
  pEl.className = 'interactive-paragraph';

  const sentences = extractSentences(paragraphText);
  const tokens = tokenizeParagraph(paragraphText);

  tokens.forEach((token) => {
    if (token.isWord) {
      const span = document.createElement('span');
      span.className = 'word-token';
      span.textContent = token.text;
      span.dataset.word = token.text;
      span.dataset.cleanWord = token.text.replace(/^[^\w]+|[^\w]+$/g, '');
      
      const sentenceContext = findSentenceForWord(token.text, sentences, paragraphText);
      span.dataset.sentence = sentenceContext;

      span.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.word-token.active-word').forEach(el => el.classList.remove('active-word'));
        span.classList.add('active-word');

        if (onWordClickCallback) {
          onWordClickCallback({
            word: token.text,
            cleanWord: span.dataset.cleanWord,
            sentence: sentenceContext,
            fullText: rawText,
            element: span
          });
        }
      });

      pEl.appendChild(span);
    } else {
      const span = document.createElement('span');
      span.className = 'punct-token';
      span.textContent = token.text;
      pEl.appendChild(span);
    }
  });

  return pEl;
}

function tokenizeParagraph(text) {
  const regex = /([a-zA-Z0-9]+(?:['’][a-zA-Z0-9]+)?)|([^a-zA-Z0-9'’]+)/g;
  const tokens = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      tokens.push({ text: match[1], isWord: true });
    } else if (match[2]) {
      tokens.push({ text: match[2], isWord: false });
    }
  }

  return tokens;
}

function extractSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function findSentenceForWord(word, sentences, paragraphText) {
  const match = sentences.find(s => s.includes(word));
  return match || paragraphText;
}
