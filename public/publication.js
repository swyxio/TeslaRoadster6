(() => {
  document.documentElement.classList.add('publication-js');
  const search = document.querySelector('.blog-search');
  if (search) {
    const input = search.querySelector('input');
    const rows = [...document.querySelectorAll('.post-row')];
    const count = search.querySelector('.search-count');
    const empty = document.querySelector('.search-empty');
    search.hidden = false;
    function filter(updateUrl) {
      const query = input.value.trim().toLowerCase();
      let visible = 0;
      for (const row of rows) {
        row.hidden = query !== '' && !query.split(/\s+/).every(term => row.dataset.search.includes(term));
        if (!row.hidden) visible++;
      }
      count.textContent = `${visible} ${visible === 1 ? 'post' : 'posts'}`;
      empty.hidden = visible !== 0;
      if (updateUrl) {
        const url = new URL(location.href);
        if (input.value.trim()) url.searchParams.set('q', input.value.trim()); else url.searchParams.delete('q');
        history.replaceState(null, '', url);
      }
    }
    function fromUrl() { input.value = new URL(location.href).searchParams.get('q') || ''; filter(false); }
    input.addEventListener('input', () => filter(true));
    search.addEventListener('submit', event => event.preventDefault());
    search.addEventListener('reset', event => { event.preventDefault(); input.value = ''; filter(true); input.focus(); });
    document.addEventListener('keydown', event => {
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { event.preventDefault(); input.focus(); }
      if (event.key === 'Escape' && document.activeElement === input) { if (input.value) { input.value = ''; filter(true); } else input.blur(); }
    });
    window.addEventListener('popstate', fromUrl);
    fromUrl();
  }
  const layout = document.querySelector('.post-layout');
  if (!layout) return;
  const rail = layout.querySelector('.index-rail');
  const resize = layout.querySelector('.rail-resize');
  const details = layout.querySelector('.toc details');
  const wide = matchMedia('(min-width: 1280px)');
  const store = { get(key) { try { return localStorage.getItem(key); } catch { return null; } }, set(key, value) { try { localStorage.setItem(key, value); } catch {} } };
  function setWidth(value) {
    const width = Math.round(Math.max(200, Math.min(380, value)));
    layout.style.setProperty('--rail-width', `${width}px`);
    resize.setAttribute('aria-valuenow', String(width));
    store.set('blog-rail-width', String(width));
  }
  const savedWidth = Number(store.get('blog-rail-width'));
  if (savedWidth) setWidth(savedWidth);
  if (store.get('blog-rail-minimized') === 'true') layout.classList.add('rail-minimized');
  layout.querySelector('.rail-toggle').addEventListener('click', () => { layout.classList.add('rail-minimized'); store.set('blog-rail-minimized', 'true'); layout.querySelector('.rail-restore').focus(); });
  layout.querySelector('.rail-restore').addEventListener('click', () => { layout.classList.remove('rail-minimized'); store.set('blog-rail-minimized', 'false'); layout.querySelector('.rail-toggle').focus(); });
  resize.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); resize.setPointerCapture(event.pointerId);
    const start = event.clientX, width = rail.getBoundingClientRect().width;
    const move = e => setWidth(width + e.clientX - start);
    const end = () => { resize.removeEventListener('pointermove', move); resize.removeEventListener('pointerup', end); resize.removeEventListener('pointercancel', end); };
    resize.addEventListener('pointermove', move); resize.addEventListener('pointerup', end); resize.addEventListener('pointercancel', end);
  });
  resize.addEventListener('keydown', event => {
    const width = Number(resize.getAttribute('aria-valuenow'));
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWidth(width + (event.key === 'ArrowLeft' ? -20 : 20)); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); setWidth(event.key === 'Home' ? 200 : 380); }
  });
  if (details) {
    function breakpoint() { details.open = wide.matches; }
    breakpoint(); wide.addEventListener('change', breakpoint);
    const links = [...details.querySelectorAll('a')];
    const headings = links.map(link => document.getElementById(decodeURIComponent(link.hash.slice(1))));
    function updateActive() {
      let active = -1;
      headings.forEach((heading, index) => { if (heading && heading.getBoundingClientRect().top <= 140) active = index; });
      links.forEach((link, index) => { if (index === active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
    }
    let queued = false;
    window.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { updateActive(); queued = false; }); } }, { passive: true });
    links.forEach(link => link.addEventListener('click', () => { if (!wide.matches) details.open = false; }));
    updateActive();
  }
})();
