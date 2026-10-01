/**
 * Text Tokenizer & Interactive Reader Renderer for WordClick v2
 * Renders the FULL opened article continuously for interactive reading.
 */

export function renderInteractiveText(rawText, containerElement, onWordClickCallback) {
  containerElement.innerHTML = '';

  if (!rawText || !rawText.trim()) return;

  const paragraphs = rawText.split(/\n+/).filter(p => p.trim().length > 0);

  paragraphs.forEach((paragraphText) => {
    const pEl = createParagraphElement(paragraphText, rawText, onWordClickCallback);
    containerElement.appendChild(pEl);
  });
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
      span.tabIndex=0;span.setAttribute('role','button');span.setAttribute('aria-label','Przetłumacz: '+token.text);
      span.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();span.click();}});
      span.dataset.word = token.text;
      span.dataset.cleanWord = token.text.replace(/^[^\w]+|[^\w]+$/g, '');
      
      const sentenceRecord = sentences.find(sentence=>token.index>=sentence.start && token.index<sentence.end) || {text:paragraphText,start:0};
      const sentenceContext = sentenceRecord.text;
      const wordOffset = token.index - sentenceRecord.start;
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
            wordOffset,
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
      tokens.push({ text: match[1], isWord: true, index: match.index });
    } else if (match[2]) {
      tokens.push({ text: match[2], isWord: false, index: match.index });
    }
  }

  return tokens;
}

function extractSentences(text) {
  const sentences=[];let start=0;
  for(const match of text.matchAll(/(?<=[.!?])\s+/g)) {
    sentences.push({text:text.slice(start,match.index),start,end:match.index});
    start=match.index+match[0].length;
  }
  if(start<text.length)sentences.push({text:text.slice(start),start,end:text.length});
  return sentences;
}
