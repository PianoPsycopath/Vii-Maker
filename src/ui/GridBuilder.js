import { playHover, playSelect, playVillagerAccept } from '../sound.js';

export function bindHoverSounds(container) {
  if (!container) return;
  container.querySelectorAll('button, .sw, .row, .tex-btn').forEach(element => {
    element.addEventListener('mouseenter', playHover);
  });
}

export function buildSwatchGrid(container, items, onSelect) {
  if (!container) return;

  const buttons = items.map(item => {
    const button = document.createElement('button');
    button.className = 'sw';
    button.style.background = item.hex;
    button.title = item.title;
    button.setAttribute('aria-label', item.title);
    button.setAttribute('aria-pressed', 'false');
    button.dataset.v = item.val;

    button.onclick = () => {
      playSelect();
      playVillagerAccept();
      onSelect(item.val);
    };
    return button;
  });

  container.replaceChildren(...buttons);
  bindHoverSounds(container);
}

export function buildTextureGrid(container, items, onSelect) {
  if (!container) return;
  container.className = 'tex-grid';

  const buttons = items.map(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tex-btn';
    button.dataset.v = item.val;
    if (item.s != null) button.dataset.s = item.s;
    button.title = item.title;
    button.setAttribute('aria-label', item.title);
    button.setAttribute('aria-pressed', 'false');

    const image = document.createElement('img');
    image.className = 'tex-thumb';
    image.alt = '';

    const label = document.createElement('span');
    label.className = 'tex-label';
    label.textContent = item.label;

    button.append(image, label);
    button.onclick = () => {
      playSelect();
      playVillagerAccept();
      onSelect(item.val);
    };
    return button;
  });

  container.replaceChildren(...buttons);
  bindHoverSounds(container);
}

export function markSwatchSelection(container, value) {
  if (!container) return;
  container.querySelectorAll('.sw').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.v == value));
  });
}

export function markTextureSelection(container, value, attr = 'v') {
  if (!container) return;
  container.querySelectorAll('.tex-btn, button[data-s], button[data-v]').forEach(button => {
    const matches = attr === 's' ? button.dataset.s === value : +button.dataset.v === value;
    button.setAttribute('aria-pressed', String(matches));
  });
}

export function applyGridThumbnails(container, thumbnails) {
  if (!container || !thumbnails) return;
  container.querySelectorAll('.tex-btn').forEach((button, index) => {
    const image = button.querySelector('.tex-thumb');
    if (image && thumbnails[index]) {
      image.src = thumbnails[index];
    }
  });
}