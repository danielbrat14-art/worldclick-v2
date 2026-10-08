/** A fresh visit, refresh and the brand link all start at the news feed. */
export function returnHome() {
  document.getElementById('nav-reader-btn').click();
  document.querySelector('[data-mode="news"]').click();
  const levelSelect = document.getElementById('news-level-select');
  if (levelSelect) { levelSelect.value = 'all'; levelSelect.dispatchEvent(new Event('change')); }
  document.querySelector('[data-cat="all"]').click();
  document.getElementById('interactive-container').classList.add('hidden');
  document.getElementById('news-grid-expanded')?.classList.add('hidden');
  document.querySelector('.expand-news-wrapper button')?.classList.remove('expanded');
  window.scrollTo({top: 0, left: 0, behavior: 'instant'});
}

export function initHomeNavigation(onHome = () => {}) {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  document.getElementById('home-link').addEventListener('click', event => {
    // Preserve normal browser actions such as opening the link in another tab.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
    event.preventDefault();
    onHome();
    returnHome();
  });
  returnHome();
  window.addEventListener('pageshow', () => window.scrollTo({top: 0, left: 0, behavior: 'instant'}));
}
