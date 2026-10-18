// This progressively enhances an otherwise complete, static changelog.
const previous = new URLSearchParams(location.search).get('since');
const context = document.querySelector('#release-context');
const releases = [...document.querySelectorAll('[data-version]')];
if (previous && context) {
  const index = releases.findIndex(entry => entry.dataset.version === previous);
  if (index < 0) {
    context.textContent = 'Your previous version is not in this changelog yet. Showing all releases.';
  } else if (index === 0) {
    context.textContent = `You last played ${releases[0].dataset.label}; there are no newer release notes.`;
  } else {
    context.textContent = `${index} ${index === 1 ? 'release' : 'releases'} since you last played ${releases[index].dataset.label}.`;
    releases.slice(0, index).forEach(entry => {
      const tag = document.createElement('span');
      tag.className = 'new-tag';
      tag.textContent = 'New to you';
      entry.querySelector('.release-meta')?.append(tag);
    });
  }
  context.hidden = false;
}
