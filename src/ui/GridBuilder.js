import { playHover, playSelect, playVillagerAccept } from '../sound.js';

const HOVER_TARGETS = 'button, .sw, .row, .tex-btn';

export function bindHoverSounds(container) {
  if (!container) return;
  container.querySelectorAll(HOVER_TARGETS).forEach(element => {
    element.addEventListener('mouseenter', playHover);
  });
}

function bindPick(button, value, onSelect) {
  button.onclick = () => {
    playSelect();
    playVillagerAccept();
    onSelect(value);
  };
}

function describe(button, title) {
  button.title = title;
  button.setAttribute('aria-label', title);
  button.setAttribute('aria-pressed', 'false');
}

export function buildSwatchGrid(container, items, onSelect) {
  if (!container) return;

  const buttons = items.map(item => {
    const button = document.createElement('button');
    button.className = 'sw';
    button.style.background = item.hex;
    button.dataset.v = item.val;
    describe(button, item.title);
    bindPick(button, item.val, onSelect);
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
    describe(button, item.title);

    const image = document.createElement('img');
    image.className = 'tex-thumb';
    image.alt = '';

    const label = document.createElement('span');
    label.className = 'tex-label';
    label.textContent = item.label;

    button.append(image, label);
    bindPick(button, item.val, onSelect);
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
  container.querySelectorAll('.tex-btn').forEach(button => {
    const matches = attr === 's' ? button.dataset.s === value : +button.dataset.v === value;
    button.setAttribute('aria-pressed', String(matches));
  });
}

export function applyGridThumbnails(container, thumbnails) {
  if (!container || !thumbnails) return;
  container.querySelectorAll('.tex-btn').forEach((button, index) => {
    const image = button.querySelector('.tex-thumb');
    if (image && thumbnails[index]) image.src = thumbnails[index];
  });
}