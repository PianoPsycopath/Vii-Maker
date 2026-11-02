import { playSelect, playTab, playToggle, playSave, playVillagerAccept } from '../sound.js';

function setToggleContent(button, iconClass, icon, text) {
  const iconEl = document.createElement('span');
  iconEl.className = iconClass;
  iconEl.textContent = icon;
  button.replaceChildren(iconEl, ` ${text}`);
}

function bindAudioControls({ soundBtn, musicBtn }, callbacks) {
  soundBtn.onclick = () => {
    const muted = callbacks.onToggleSfx();
    setToggleContent(soundBtn, 'sound-icon', muted ? '🔇' : '🔊', muted ? 'SFX OFF' : 'SFX ON');
  };

  musicBtn.onclick = () => {
    playSelect();
    const enabled = callbacks.onToggleMusic();
    setToggleContent(musicBtn, 'music-icon', enabled ? '🎵' : '🔇', enabled ? 'Music ON' : 'Music OFF');
  };
}

function bindLookControls(elements, callbacks) {
  elements.simShiftCheckbox.onchange = event => {
    playToggle();
    callbacks.onToggleShiftSim(event.target.checked);
  };

  elements.specialBtn.onclick = () => {
    playToggle();
    callbacks.onToggleSpecial();
  };

  elements.genderSegment.querySelectorAll('button[data-k]').forEach(button => {
    button.onclick = () => {
      playToggle();
      playVillagerAccept();
      callbacks.onChangeGender(button.dataset.k);
    };
  });

  elements.heightSlider.oninput = event => {
    callbacks.onPatchLook({ t: +event.target.value });
  };

  elements.tierSelect.onchange = event => {
    playSelect();
    callbacks.onUpdateTier(+event.target.value);
  };

  elements.nameInput.addEventListener('input', event => {
    callbacks.onNameInput(event.target.value);
  });
}

function bindListControls({ searchInput }, callbacks) {
  searchInput.oninput = () => callbacks.onSearchOrFilterChange();

  const filterButtons = document.querySelectorAll('[data-f]');
  filterButtons.forEach(button => {
    button.onclick = () => {
      playTab();
      filterButtons.forEach(other => {
        other.setAttribute('aria-pressed', String(other === button));
      });
      callbacks.onFilterChange(button.dataset.f);
    };
  });
}

function bindActionControls(elements, callbacks) {
  elements.saveBtn.onclick = () => {
    if (!elements.nameInput.value.trim()) {
      elements.nameInput.focus();
      return;
    }
    playSave();
    playVillagerAccept(0.7);
    callbacks.onSave();
  };

  elements.resetBtn.onclick = () => {
    playToggle();
    callbacks.onReset();
  };

  elements.randomBtn.onclick = () => callbacks.onRandomize();
}

function bindExportControls(elements, callbacks) {
  const { shareBtn, shareTree, exportModeSelect, fileInput } = elements;

  shareBtn.onclick = () => {
    playToggle();
    const open = !shareTree.classList.contains('open');
    shareTree.classList.toggle('open', open);
    shareBtn.setAttribute('aria-expanded', String(open));
    callbacks.onShareToggle?.(open);
  };

  elements.exportEditsBtn.onclick = () => {
    playSelect();
    callbacks.onExportEdits();
  };

  elements.exportAllBtn.onclick = () => {
    playSelect();
    callbacks.onExportAll();
  };

  elements.exportRPBtn.onclick = () => {
    playSave();
    callbacks.onExportRP(exportModeSelect.value);
  };

  if (typeof window.showDirectoryPicker !== 'function') {
    const weaveOption = exportModeSelect.querySelector('option[value="weave"]');
    weaveOption.disabled = true;
    weaveOption.textContent += ' (Chrome/Edge only)';
  }

  elements.importBtn.onclick = () => {
    playSelect();
    fileInput.click();
  };

  fileInput.onchange = async event => {
    const [file] = event.target.files;
    if (!file) return;
    await callbacks.onImportFile(file);
    event.target.value = '';
  };
}

function bindPlazaControls({ paradeBtn, viewPlazaBtn }, callbacks) {
  paradeBtn.onclick = () => {
    playToggle();
    const active = callbacks.onToggleParade();
    paradeBtn.textContent = active ? 'Parade ON' : 'Parade OFF';
    paradeBtn.setAttribute('aria-pressed', String(active));
  };

  viewPlazaBtn.onclick = () => {
    playSelect();
    callbacks.onRequestPlaza();
  };
}

export function bindEvents(elements, callbacks, openTab) {
  document.querySelectorAll('.mii-tab').forEach(button => {
    button.addEventListener('click', () => openTab(button.dataset.tab));
  });

  bindAudioControls(elements, callbacks);
  bindLookControls(elements, callbacks);
  bindListControls(elements, callbacks);
  bindActionControls(elements, callbacks);
  bindExportControls(elements, callbacks);
  bindPlazaControls(elements, callbacks);
}