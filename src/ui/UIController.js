import { playTab } from '../sound.js';
import { ICONS } from './icons.js';
import { fitTabIcons } from '../utils/iconFitter.js';
import { bindHoverSounds } from './GridBuilder.js';
import { DEFAULT_FOCUS, DEFAULT_TAB, EXPORT_TAB, TAB_FOCUS } from './constants.js';
import { queryElements } from './dom.js';
import { bindEvents } from './bindEvents.js';
import { beginDiceLaunch } from './diceLaunch.js';
import { EditorGrids } from './EditorGrids.js';
import { EditorSync } from './EditorSync.js';
import { ExportLayout } from './ExportLayout.js';
import { PlazaView } from './PlazaView.js';
import { VillagerList } from './VillagerList.js';

export class UIController {
  constructor({ manifest, lookups, callbacks }) {
    this.callbacks = callbacks;
    this.activeTab = DEFAULT_TAB;
    this.elements = queryElements();

    this.exportLayout = new ExportLayout(this.elements);
    this.grids = new EditorGrids({ elements: this.elements, manifest, lookups, callbacks });
    this.editorSync = new EditorSync({ elements: this.elements, manifest, lookups, grids: this.grids });
    this.villagerList = new VillagerList(this.elements, callbacks);
    this.plaza = new PlazaView(this.elements);

    window.addEventListener('resize', () => this.updateExportShift());
  }

  initialize() {
    fitTabIcons();
    this.injectIcons();
    this.grids.build();
    bindEvents(this.elements, this.callbacks, (id, options) => this.openTab(id, options));
    bindHoverSounds(this.elements.body);
    this.updateExportShift();
  }

  injectIcons() {
    document.querySelectorAll('[data-icon]').forEach(slot => {
      slot.innerHTML = ICONS[slot.dataset.icon] || '';
    });
  }

  openTab(targetId, { quiet = false, instant = false } = {}) {
    const { body } = this.elements;
    const isExport = targetId === EXPORT_TAB;
    const exportChanged = isExport !== body.classList.contains('export-view');

    document.querySelectorAll('.mii-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === targetId);
    });
    if (!isExport) {
      document.querySelectorAll('#edit .tab-content').forEach(section => {
        section.hidden = section.id !== targetId;
      });
    }
    this.activeTab = targetId;

    if (exportChanged) {
      this.updateExportShift();
      if (instant) this.exportLayout.skipTransition();
    }
    body.classList.toggle('export-view', isExport);
    if (exportChanged) this.callbacks.onExportViewChange?.(isExport, instant);

    this.callbacks.onTabChange(TAB_FOCUS[targetId] || DEFAULT_FOCUS, instant);
    if (!quiet) playTab();
  }

  updateExportShift() {
    this.exportLayout.update();
  }

  skipExportSlide() {
    this.exportLayout.skipTransition();
  }

  applyThumbnails(thumbs) {
    this.grids.applyThumbnails(thumbs);
  }

  resetStyleCache() {
    this.grids.resetStyleCache();
  }

  sync(state, simulation, appData) {
    this.editorSync.sync(state, simulation, appData);
  }

  syncPreviewConfig(previewConfig) {
    this.editorSync.syncPreviewConfig(previewConfig);
  }

  syncDirtyStatus(state, appData) {
    this.editorSync.syncDirtyStatus(state, appData);
  }

  renderVillagerList(state, appData) {
    this.villagerList.render(state, appData);
  }

  setNameInputValue(name) {
    this.elements.nameInput.value = name;
  }

  setShiftSimChecked(checked) {
    this.elements.simShiftCheckbox.checked = checked;
  }

  setStatus(message) {
    this.elements.status.textContent = message;
    this.elements.exportStatus.textContent = message;
  }

  beginDiceLaunch() {
    return beginDiceLaunch(this.elements.randomBtn);
  }

  preparePlazaDOM(freshLoad) {
    return this.plaza.prepare(freshLoad);
  }

  clearPlazaDOM() {
    this.plaza.clear();
  }

  setPlazaBodyState(state) {
    this.plaza.setBodyState(state);
  }

  setupIntroScreen(onStartIntro) {
    this.plaza.setupIntro(onStartIntro);
  }

  markIntroReady() {
    this.plaza.markIntroReady();
  }
}