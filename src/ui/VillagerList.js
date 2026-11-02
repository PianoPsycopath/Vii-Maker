import { playSelect } from '../sound.js';
import { bindHoverSounds } from './GridBuilder.js';

const MAX_ROWS = 300;
const WORD_SPLIT = /[\s_\-'.]+/;

function rankMatch(name, query) {
  const lower = name.toLowerCase();
  if (lower.startsWith(query)) return 0;
  if (lower.split(WORD_SPLIT).some(word => word.startsWith(query))) return 1;
  return 2;
}

function genderTag(record) {
  if (record.s) return `★ ${record.k}`;
  return record.k === 'f' ? '♀' : '♂';
}

export class VillagerList {
  constructor({ searchInput, countLabel, listContainer }, callbacks) {
    this.searchInput = searchInput;
    this.countLabel = countLabel;
    this.listContainer = listContainer;
    this.callbacks = callbacks;
  }

  render(state, appData) {
    const query = this.searchInput.value.trim().toLowerCase();
    const matches = this.findMatches(state, appData, query);

    this.countLabel.textContent = `(${matches.length})`;

    const rows = matches
      .slice(0, MAX_ROWS)
      .map(name => this.createRow(name, state, appData));
    this.listContainer.replaceChildren(...rows);

    if (matches.length > MAX_ROWS) {
      const note = document.createElement('p');
      note.className = 'list-note';
      note.textContent = `Showing ${MAX_ROWS} of ${matches.length}. Search to narrow.`;
      this.listContainer.append(note);
    }

    bindHoverSounds(this.listContainer);
  }

  findMatches(state, appData, query) {
    const matches = state.getAllNames({ sorted: true }).filter(name => {
      if (query && !name.toLowerCase().includes(query)) return false;
      if (state.filter === 'all') return true;
      return state.filter === 'edited' ? appData.over[name] : state.lookup(name)?.s;
    });

    if (query) matches.sort((a, b) => rankMatch(a, query) - rankMatch(b, query));
    return matches;
  }

  createRow(name, state, appData) {
    const row = document.createElement('button');
    row.className = 'row';
    row.setAttribute('role', 'listitem');
    if (name === state.current.name) row.setAttribute('aria-current', 'true');

    const label = document.createElement('span');
    if (appData.over[name]) {
      const dot = document.createElement('i');
      dot.className = 'dot';
      label.append(dot);
    }
    label.append(name);

    const tag = document.createElement('small');
    tag.textContent = genderTag(state.lookup(name));

    row.append(label, tag);
    row.onclick = () => {
      playSelect();
      this.callbacks.onSelectVillager(name);
    };
    return row;
  }
}