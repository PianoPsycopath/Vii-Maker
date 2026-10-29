import {
  clamp, HEX, SKINS, createLookups, eyeStyle, eyeColor, eyeRange, eyeIndex, 
  EYE_STYLES, EYE_MAX, hairStyle, hairColor, hairRange, hairIndex, HAIR_STYLES, 
  HAIR_MAX, sheetToRecords, computeInGameLook, loadAppData, NOSE_STYLES, SKIN_TONES
} from './data.js';
import { initViewer } from './viewer.js';
import { generateBedrockFiles, generateCSVText } from './exporter.js';
import {
  playHover, playSelect, playTab, playToggle, playRandom, playSave, 
  toggleMute, isMuted, loadMusic, playIntro, startMusic, setMusicScene, 
  setMusicEnabled, isMusicEnabled, loadSfx, playVillagerAccept
} from './sound.js';
import { BIOME_NAMES } from './tint.js';
import { PlazaScene } from './plaza.js';

import { fitTabIcons } from './utils/iconFitter.js';
import { EditorState } from './core/EditorState.js';

const $ = selector => document.querySelector(selector);
const formatName = str => str.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

const TAB_FOCUS_MAP = {
  'tab-plaza': 'full',
  'tab-id': 'body',
  'tab-face': 'face',
  'tab-hair': 'hair',
  'tab-brows': 'brows',
  'tab-eyes': 'eyes',
  'tab-nose': 'nose',
  'tab-mouth': 'mouth',
  'tab-glasses': 'glasses',
  'tab-outfit': 'outfit',
  'tab-export': 'full'
};

async function initApplication() {
  fitTabIcons();

  const appData = await loadAppData();
  const state = new EditorState(appData.base, appData.over, appData.persist);
  const lookups = createLookups(appData.M);
  
  let activeTab = 'tab-plaza';
  let lastHairStyle = null;
  let lastEyeStyle = null;
  let plazaApi = null;
  let isParadeActive = false;

  const viewer = initViewer({
    canvas: $('#cv'),
    stageEl: $('#stage'),
    spinCheckbox: $('#spin'),
    GEO: appData.GEO,
    M: appData.M,
    lookups
  });

  function getRenderedLook() {
    return computeInGameLook(
      state.current.name, 
      state.current, 
      state.previewConfig.prof, 
      state.previewConfig.skin, 
      state.previewConfig.biome, 
      state.isShiftSimulated
    );
  }

  function updatePreview() {
    const simulation = getRenderedLook();
    viewer.setHeight(simulation.t);
    viewer.setNose(simulation.n);
    viewer.compose(simulation, state.previewConfig, $('#shiftInfo'), $('#status'));
  }

  function renderVillagerList() {
    const query = $('#q').value.trim().toLowerCase();
    const allNames = [...new Set([...Object.keys(appData.base), ...Object.keys(appData.over)])].sort((a, b) => a.localeCompare(b));
    
    const matches = allNames.filter(name => {
      const matchesSearch = !query || name.toLowerCase().includes(query);
      const matchesFilter = state.filter === 'all' || 
                            (state.filter === 'edited' ? appData.over[name] : state.lookup(name).s);
      return matchesSearch && matchesFilter;
    });

    if (query) {
      const rank = n => {
        const lower = n.toLowerCase();
        if (lower.startsWith(query)) return 0;
        if (lower.split(/[\s_\-'.]+/).some(word => word.startsWith(query))) return 1;
        return 2;
      };
      matches.sort((a, b) => rank(a) - rank(b));
    }
    
    $('#count').textContent = `(${matches.length})`;

    const listContainer = $('#list');
    listContainer.replaceChildren(...matches.slice(0, 300).map(name => {
      const btn = document.createElement('button');
      btn.className = 'row';
      btn.setAttribute('role', 'listitem');
      if (name === state.current.name) btn.setAttribute('aria-current', 'true');
      
      const record = state.lookup(name);
      btn.innerHTML = `<span>${appData.over[name] ? '<i class="dot"></i>' : ''}</span><small></small>`;
      btn.firstChild.append(name);
      btn.lastChild.textContent = record.s ? `★ ${record.k}` : (record.k === 'f' ? '♀' : '♂');
      
      btn.onclick = () => {
        playSelect();
        setActiveVillager(name);
      };
      return btn;
    }));

    if (matches.length > 300) {
      const disclaimer = document.createElement('p');
      disclaimer.style.cssText = 'color:var(--wii-muted);font-size:12px;padding:6px 10px';
      disclaimer.textContent = `Showing 300 of ${matches.length}. Search to narrow.`;
      listContainer.append(disclaimer);
    }
    bindHoverSounds(listContainer);
  }

  function syncUI() {
    const simulation = getRenderedLook();
    
    $('#typeL').textContent = state.current.s ? '★ Locked Special' : 'Shifts by 6 × Prof';
    document.querySelectorAll('#genderS button[data-k]').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === state.current.k));
    $('#specBtn').setAttribute('aria-pressed', !!state.current.s);

    const currentEyeStyle = eyeStyle(simulation.e);
    const baseEyeStyle = eyeStyle(state.current.e);
    const shownEyeText = `${simulation.e} · ${currentEyeStyle} ${lookups.eyeName(simulation.e)}`;
    $('#eyesL').textContent = simulation.e !== state.current.e 
      ? `${shownEyeText} (Base ${state.current.e} · ${baseEyeStyle} ${lookups.eyeName(state.current.e)})` 
      : shownEyeText;

    const currentHairStyle = hairStyle(simulation.h);
    const baseHairStyle = hairStyle(state.current.h);
    const shownHairText = currentHairStyle === 'bald' ? 'bald (72)' : `${simulation.h} · ${currentHairStyle} ${lookups.hairName(simulation.h)}`;
    const baseHairText = baseHairStyle === 'bald' ? 'bald (72)' : `Base ${state.current.h} · ${baseHairStyle} ${lookups.hairName(state.current.h)}`;
    $('#hairL').textContent = simulation.h !== state.current.h ? `${shownHairText} (${baseHairText})` : shownHairText;

    const shownOutfitText = `${simulation.o} · ${appData.M.colors[simulation.o - 1]}`;
    $('#outL').textContent = simulation.o !== state.current.o 
      ? `${shownOutfitText} (Base ${state.current.o} · ${appData.M.colors[state.current.o - 1]})` 
      : shownOutfitText;

    $('#htL').textContent = simulation.t !== state.current.t ? `${simulation.t} (Base ${state.current.t})` : simulation.t;
    $('#ht').value = simulation.t;

    // Rebuild grids if style changed procedurally
    if (currentHairStyle !== lastHairStyle) { 
      buildHairGrid(simulation.h); 
      lastHairStyle = currentHairStyle; 
    }
    if (currentEyeStyle !== lastEyeStyle) { 
      buildEyesGrid(simulation.e); 
      lastEyeStyle = currentEyeStyle; 
    }

    document.querySelectorAll('#eyesS button').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === currentEyeStyle));
    document.querySelectorAll('#hairS button').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === currentHairStyle));
    
    const shownNose = NOSE_STYLES[simulation.n | 0];
    const baseNose = NOSE_STYLES[state.current.n | 0];
    $('#noseL').textContent = (simulation.n | 0) !== (state.current.n | 0) ? `${shownNose} (Base ${baseNose})` : shownNose;
    document.querySelectorAll('#noseS button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === (simulation.n | 0)));
    
    markGridItem($('#eyesG'), simulation.e);
    markGridItem($('#hairG'), simulation.h);
    markGridItem($('#outG'), simulation.o);
    
    $('#skinToneL').textContent = SKIN_TONES[simulation.sk | 0]?.name || '';
    markGridItem($('#skinToneG'), simulation.sk | 0);
    syncPreviewUI();

    const exists = !!state.lookup(state.current.name);
    const isEdited = !!appData.over[state.current.name];
    const chip = $('#chip');
    
    chip.className = state.isDirty() ? 'unsaved' : '';
    chip.textContent = !state.current.name ? 'Unnamed Preview' 
      : !exists ? (state.isDirty() ? 'New · unsaved' : 'New') 
      : state.isDirty() ? 'Unsaved changes' 
      : isEdited ? 'Edited' : 'From sheet';
      
    $('#reset').textContent = isEdited && appData.base[state.current.name] ? 'Reset to sheet' 
      : isEdited ? 'Delete' : 'Reset';

    updatePreview();
    renderVillagerList();
  }

  function syncPreviewUI() {
    const markTextureBtn = (container, val) => container.querySelectorAll('.tex-btn').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === val));
    markTextureBtn($('#profG'), state.previewConfig.prof);
    markTextureBtn($('#biomeG'), state.previewConfig.biome);
    markTextureBtn($('#skinG'), state.previewConfig.skin);
    
    const profObj = appData.M.professions[state.previewConfig.prof];
    $('#profL').textContent = `${state.previewConfig.prof} · ${profObj ? formatName(profObj.id) : ''}`;
    $('#biomeL').textContent = `${state.previewConfig.biome} · ${formatName(BIOME_NAMES[state.previewConfig.biome] || '')}`;
    $('#skinL').textContent = `ID ${state.previewConfig.skin}`;
    $('#tier').value = state.previewConfig.tier;
  }

  function setActiveVillager(name) {
    const record = state.lookup(name);
    state.current = { 
      name, 
      n: 0, 
      sk: 0, 
      ...(record || { e: state.current.e, h: state.current.h, o: state.current.o, t: state.current.t, k: state.current.k, n: state.current.n | 0, sk: state.current.sk | 0, s: 0 }) 
    };
    state.saved = record || null;
    $('#name').value = name;
    lastHairStyle = null;
    lastEyeStyle = null;
    syncUI();
  }

  function bindHoverSounds(container) {
    container.querySelectorAll('button, .sw, .row, .tex-btn').forEach(el => {
      el.addEventListener('mouseenter', playHover);
    });
  }

  function buildSwatchGrid(container, items, onSelect) {
    container.replaceChildren(...items.map(item => {
      const btn = document.createElement('button');
      btn.className = 'sw';
      btn.style.background = item.hex;
      btn.title = item.title;
      btn.setAttribute('aria-label', item.title);
      btn.setAttribute('aria-pressed', 'false');
      btn.dataset.v = item.val;
      btn.onclick = () => {
        playSelect();
        playVillagerAccept();
        onSelect(item.val);
      };
      return btn;
    }));
    bindHoverSounds(container);
  }

  function buildTextureGrid(container, items, onSelect) {
    if (!container) return;
    container.className = 'tex-grid';
    container.replaceChildren(...items.map(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tex-btn';
      btn.dataset.v = item.val;
      if (item.s != null) btn.dataset.s = item.s;
      btn.title = item.title;
      btn.setAttribute('aria-label', item.title);
      btn.setAttribute('aria-pressed', 'false');

      const img = document.createElement('img');
      img.className = 'tex-thumb';
      img.alt = '';
      
      const label = document.createElement('span');
      label.className = 'tex-label';
      label.textContent = item.label;

      btn.append(img, label);
      btn.onclick = () => {
        playSelect();
        playVillagerAccept();
        onSelect(item.val);
      };
      return btn;
    }));
    bindHoverSounds(container);
  }

  function markGridItem(container, val) {
    container.querySelectorAll('.sw').forEach(b => b.setAttribute('aria-pressed', b.dataset.v == val));
  }

  function buildEyesGrid(renderedEye) {
    const styleName = eyeStyle(renderedEye);
    const [startIdx, endIdx] = eyeRange(styleName);
    buildSwatchGrid(
      $('#eyesG'),
      Array.from({ length: Math.max(0, endIdx - startIdx + 1) }, (_, i) => ({
        val: startIdx + i,
        hex: lookups.eyeHex(startIdx + i),
        title: `${startIdx + i} (${styleName} ${lookups.eyeName(startIdx + i)})`
      })),
      val => { state.applyPreviewPatch({ e: val }); syncUI(); }
    );
  }

  function buildHairGrid(renderedHair) {
    const styleName = hairStyle(renderedHair);
    const [startIdx, endIdx] = hairRange(styleName);
    buildSwatchGrid(
      $('#hairG'),
      Array.from({ length: Math.max(0, endIdx - startIdx + 1) }, (_, i) => ({
        val: startIdx + i,
        hex: lookups.hairHex(startIdx + i),
        title: `${startIdx + i} ${lookups.hairName(startIdx + i)}`
      })),
      val => { state.applyPreviewPatch({ h: val }); syncUI(); }
    );
  }

  
  const eyeLabelFormat = str => str[0].toUpperCase() + str.slice(1);
  const hairLabelFormat = str => str === 'bald' ? 'Bald' : str === 'ari' ? 'Ari' : str === 'alex' ? 'Alex' : str[0].toUpperCase() + str.slice(1);

  buildTextureGrid($('#eyesS'), EYE_STYLES.map(s => ({ val: s, s, label: eyeLabelFormat(s), title: `Eye Style: ${eyeLabelFormat(s)}` })),
    style => {
      const rendered = getRenderedLook();
      state.applyPreviewPatch({ e: eyeIndex(style, eyeColor(rendered.e) || 1) });
      syncUI();
    }
  );

  buildTextureGrid($('#hairS'), ['bald', ...HAIR_STYLES].map(s => ({ val: s, s, label: hairLabelFormat(s), title: `Hair Style: ${hairLabelFormat(s)}` })),
    style => {
      const rendered = getRenderedLook();
      state.applyPreviewPatch({ h: hairIndex(style, hairColor(rendered.h) || 16) });
      syncUI();
    }
  );

  buildTextureGrid($('#noseS'), NOSE_STYLES.map((s, i) => ({ val: i, s, label: eyeLabelFormat(s), title: `Nose Style: ${eyeLabelFormat(s)}` })),
    idx => { state.applyPreviewPatch({ n: idx }); syncUI(); }
  );

  buildSwatchGrid($('#outG'), Array.from({ length: 34 }, (_, i) => ({ val: i + 1, hex: HEX[appData.M.colors[i]], title: `${i + 1} ${appData.M.colors[i]}` })),
    val => { state.applyPreviewPatch({ o: val }); syncUI(); }
  );

  buildSwatchGrid($('#skinToneG'), SKIN_TONES.map((t, i) => ({ val: i, hex: t.hex, title: `${i} ${t.name}` })),
    val => { state.current.sk = val; syncUI(); }
  );

  buildTextureGrid($('#profG'), appData.M.professions.map((p, i) => ({ val: i, label: formatName(p.id), title: `${i}: ${formatName(p.id)}` })),
    val => { state.previewConfig.prof = val; syncUI(); }
  );
  buildTextureGrid($('#biomeG'), BIOME_NAMES.map((b, i) => ({ val: i, label: formatName(b), title: `${i}: ${formatName(b)}` })),
    val => { state.previewConfig.biome = val; syncUI(); }
  );
  buildTextureGrid($('#skinG'), SKINS.map((_, i) => ({ val: i, label: `Skin ${i}`, title: `Skin ID ${i}` })),
    val => { state.previewConfig.skin = val; syncUI(); }
  );

  viewer.renderThumbnails().then(thumbs => {
    const applyThumbs = (selector, thumbArray) => {
      $(selector)?.querySelectorAll('.tex-btn').forEach((btn, i) => {
        const img = btn.querySelector('.tex-thumb');
        if (img && thumbArray?.[i]) img.src = thumbArray[i];
      });
    };
    applyThumbs('#profG', thumbs.profThumbs);
    applyThumbs('#biomeG', thumbs.biomeThumbs);
    applyThumbs('#skinG', thumbs.skinThumbs);
    applyThumbs('#hairS', thumbs.hairThumbs);
    applyThumbs('#eyesS', thumbs.eyeThumbs);
    applyThumbs('#noseS', thumbs.noseThumbs);
  });

  function openTab(targetId, { quiet = false, instant = false } = {}) {
    document.querySelectorAll('.mii-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === targetId));
    document.querySelectorAll('.tab-content').forEach(content => content.hidden = content.id !== targetId);
    
    activeTab = targetId;
    updatePreview();
    viewer.focus(TAB_FOCUS_MAP[targetId] || 'full', instant);
    if (!quiet) playTab();
  }

  document.querySelectorAll('.mii-tab').forEach(btn => {
    btn.addEventListener('click', () => openTab(btn.dataset.tab));
  });

  $('#soundBtn').onclick = () => {
    const muted = toggleMute();
    $('#soundBtn').innerHTML = muted ? '<span class="sound-icon">🔇</span> SFX OFF' : '<span class="sound-icon">🔊</span> SFX ON';
  };

  $('#simShift').onchange = (e) => {
    playToggle();
    state.isShiftSimulated = e.target.checked;
    syncUI();
  };

  $('#specBtn').onclick = () => {
    playToggle();
    state.current.s = state.current.s ? 0 : 1;
    syncUI();
  };

  document.querySelectorAll('#genderS button[data-k]').forEach(btn => {
    btn.onclick = () => {
      playToggle();
      playVillagerAccept();
      state.current.k = btn.dataset.k;
      
      const rendered = getRenderedLook();
      const styleName = hairStyle(rendered.h);
      if (!state.current.s && (styleName === 'ari' || styleName === 'alex')) {
        state.applyPreviewPatch({ h: hairIndex(state.current.k === 'f' ? 'alex' : 'ari', hairColor(rendered.h)) });
      }
      syncUI();
    };
  });

  $('#ht').oninput = e => {
    state.applyPreviewPatch({ t: +e.target.value });
    syncUI();
  };

  $('#tier').onchange = e => {
    playSelect();
    state.previewConfig.tier = +e.target.value;
    updatePreview();
  };

  $('#name').addEventListener('input', e => {
    const nameStr = e.target.value;
    const record = state.lookup(nameStr);
    
    if (record) { 
      state.current = { name: nameStr, n: 0, sk: 0, ...record }; 
      state.saved = record; 
      lastHairStyle = null; 
      lastEyeStyle = null; 
    } else { 
      state.current.name = nameStr; 
      state.saved = null; 
    }
    syncUI();
  });

  $('#q').oninput = renderVillagerList;
  document.querySelectorAll('[data-f]').forEach(btn => {
    btn.onclick = () => {
      playTab();
      state.filter = btn.dataset.f;
      document.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', x === btn));
      renderVillagerList();
    };
  });

  $('#save').onclick = () => {
    if (!state.current.name.trim()) { $('#name').focus(); return; }
    playSave();
    playVillagerAccept(0.7);
    state.saveCurrent();
    $('#name').value = state.current.name;
    syncUI();
  };

  $('#reset').onclick = () => {
    playToggle();
    if (appData.over[state.current.name]) { 
      delete appData.over[state.current.name]; 
      appData.persist(); 
      setActiveVillager(state.current.name); 
    } else if (state.saved) {
      setActiveVillager(state.current.name);
    }
  };

  $('#rand').onclick = () => {
    playRandom();
    playVillagerAccept(0.4);
    
    const randomInt = max => 1 + Math.floor(Math.random() * max);
    const eyeStyleRand = EYE_STYLES[randomInt(EYE_STYLES.length) - 1];
    
    state.current.e = eyeIndex(eyeStyleRand, randomInt(34));
    state.current.o = randomInt(34);
    state.current.t = randomInt(34);
    state.current.n = randomInt(NOSE_STYLES.length) - 1;
    state.current.sk = randomInt(SKIN_TONES.length) - 1;
    
    const defaultGenderHair = state.current.k === 'f' ? 'alex' : 'ari';
    const randHairStyle = Math.random() < 0.05 ? 'bald' : Math.random() < 0.5 ? defaultGenderHair : HAIR_STYLES[randomInt(HAIR_STYLES.length) - 1];
    
    state.current.h = hairIndex(randHairStyle, randomInt(35));
    syncUI();
  };

  const triggerDownload = (content, filename) => {
    const a = document.createElement('a');
    const blobData = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    a.href = URL.createObjectURL(new Blob([blobData], { type: 'application/octet-stream' }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  $('#exp').onclick = () => { playSelect(); triggerDownload(appData.over, 'villager-edits.json'); };
  $('#expAll').onclick = () => { 
    playSelect(); 
    const combined = Object.fromEntries(Object.keys({ ...appData.base, ...appData.over }).sort().map(n => [n, state.lookup(n)]));
    triggerDownload(combined, 'villagers-all.json'); 
  };
  $('#expCSV').onclick = () => {
    playSelect();
    triggerDownload(generateCSVText(appData.base, appData.over, state.lookup.bind(state)), 'Villager Names - Sheet1.csv');
    $('#status').textContent = 'Exported Villager Names - Sheet1.csv.';
  };
  $('#expRP').onclick = () => {
    playSave();
    const { entityJson, rcJson, stats } = generateBedrockFiles(appData.M, appData.base, appData.over, state.lookup.bind(state), lookups);
    triggerDownload(entityJson, 'villager_v2.entity.json');
    setTimeout(() => triggerDownload(rcJson, 'villager_v2.render_controllers.json'), 250);
    
    const noseGeos = Object.fromEntries(Object.entries(appData.GEO).filter(([k]) => k.startsWith('geometry.villager_nose_')));
    if (Object.keys(noseGeos).length) {
      setTimeout(() => triggerDownload({ format_version: appData.GEO.format_version || '1.8.0', ...noseGeos }, 'villager_nose.geo.json'), 500);
    }
    $('#status').textContent = `Exported Bedrock RP files (${stats.regularCount} shifted regulars + ${stats.specialCount} locked specials).`;
  };

  $('#imp').onclick = () => { playSelect(); $('#file').click(); };
  $('#file').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    let records;
    try {
      records = file.name.endsWith('.csv') ? sheetToRecords(text) : JSON.parse(text);
    } catch {
      $('#status').textContent = 'Could not read that file. Use a villager JSON export or a sheet CSV.';
      return;
    }
    
    let count = 0;
    for (const [key, rec] of Object.entries(records)) {
      if (!rec || typeof rec.e !== 'number') continue;
      
      const parsedRecord = { 
        e: clamp(rec.e, 1, EYE_MAX), 
        h: clamp(rec.h, 0, HAIR_MAX), 
        o: clamp(rec.o, 1, 34), 
        t: clamp(rec.t, 1, 34), 
        k: rec.k || 'm', 
        ...(rec.s ? { s: 1 } : {}), 
        ...(rec.n ? { n: clamp(rec.n, 0, NOSE_STYLES.length - 1) } : {}), 
        ...(rec.sk !== undefined ? { sk: clamp(rec.sk, 0, SKIN_TONES.length - 1) } : {}) 
      };
      
      if (appData.base[key] && JSON.stringify(appData.base[key]) === JSON.stringify(parsedRecord)) {
        delete appData.over[key];
      } else {
        appData.over[key] = parsedRecord;
      }
      count++;
    }
    playSave();
    appData.persist();
    e.target.value = '';
    renderVillagerList();
    $('#status').textContent = `Imported ${count} villagers into your edits.`;
    if (state.current.name) setActiveVillager(state.current.name);
  };

  function launchPlaza(freshLoad = false) {
    const body = document.body;
    const allNames = [...new Set([...Object.keys(appData.base), ...Object.keys(appData.over)])].filter(n => state.lookup(n));
    if (!allNames.length) { 
      body.classList.remove('plaza-mode', 'plaza-hold', 'plaza-leaving'); 
      return; 
    }
    
    if (freshLoad) document.querySelectorAll('#plazaCv, #plazaLabels, #plazaHint').forEach(e => e.remove());
    if (!$('#plazaCv')) {
      const cv = document.createElement('canvas');
      cv.id = 'plazaCv';
      cv.setAttribute('aria-label', 'Villager plaza. Pick a villager to edit.');
      
      const labels = document.createElement('div');
      labels.id = 'plazaLabels';
      
      const hint = document.createElement('div');
      hint.id = 'plazaHint';
      hint.innerHTML = '<strong>Villager Plaza</strong><span>Pick a villager to edit</span>';
      document.body.prepend(cv, labels, hint);
    }
    
    const cv = $('#plazaCv');
    if (freshLoad) cv.style.opacity = '0';
    
    try {
      plazaApi = new PlazaScene({
        canvas: cv,
        labelsEl: $('#plazaLabels'),
        hintEl: $('#plazaHint'),
        stageEl: $('#stage'),
        GEO: appData.GEO, 
        M: appData.M, 
        lookups, 
        names: allNames, 
        lookup: state.lookup.bind(state),
        count: 10,
        parade: isParadeActive,
        onPick: (name, lookConfig) => {
          playSelect();
          setMusicScene('edit');
          body.classList.add('plaza-leaving');
          Object.assign(state.previewConfig, lookConfig);
          $('#simShift').checked = true;
          state.isShiftSimulated = true;
          
          syncPreviewUI();
          setActiveVillager(name);
          openTab('tab-plaza', { quiet: true, instant: true });
        },
        onReveal: () => { body.classList.remove('plaza-mode', 'plaza-leaving'); playTab(); },
        onHandoff: () => { plazaApi = null; body.classList.remove('plaza-hold'); }
      });
      
      plazaApi.initialize();
      if (freshLoad) requestAnimationFrame(() => requestAnimationFrame(() => { cv.style.opacity = ''; }));
    } catch (error) {
      console.warn('Plaza failed, opening the editor instead', error);
      plazaApi = null;
      ['#plazaCv', '#plazaLabels', '#plazaHint'].forEach(s => $(s)?.remove());
      body.classList.remove('plaza-mode', 'plaza-hold', 'plaza-leaving');
    }
  }

  $('#paradeBtn').onclick = () => {
    playToggle();
    isParadeActive = !isParadeActive;
    $('#paradeBtn').innerHTML = isParadeActive ? 'Parade ON' : 'Parade OFF';
    $('#paradeBtn').setAttribute('aria-pressed', isParadeActive);
    
    if (plazaApi) plazaApi.setParade(isParadeActive);
    setMusicScene(isParadeActive ? 'parade' : 'plaza');
  };

  $('#viewPlaza').onclick = () => {
    if (plazaApi) return;
    playSelect();
    setMusicScene(isParadeActive ? 'parade' : 'plaza');
    openTab('tab-plaza', { quiet: true, instant: true });
    document.body.classList.remove('plaza-leaving');
    document.body.classList.add('plaza-mode', 'plaza-hold');
    launchPlaza(true);
  };

  $('#musicBtn').onclick = () => {
    playSelect();
    const isEnabled = !isMusicEnabled();
    setMusicEnabled(isEnabled);
    $('#musicBtn').innerHTML = isEnabled ? '<span class="music-icon">🎵</span> Music ON' : '<span class="music-icon">🔇</span> Music OFF';
  };

  bindHoverSounds(document.body);
  setActiveVillager(appData.base['Abren'] ? 'Abren' : Object.keys(appData.base)[0]);
  launchPlaza();

  const introOverlay = $('#introScreen');
  let isIntroBegun = false;
  
  loadMusic().then(() => introOverlay.classList.add('ready'));
  loadSfx();
  
  const startIntro = async () => {
    if (isIntroBegun) return;
    isIntroBegun = true;
    introOverlay.classList.add('leaving');
    setTimeout(() => introOverlay.remove(), 1600);
    await playIntro();
    startMusic();
  };
  
  introOverlay.addEventListener('click', startIntro);
  introOverlay.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startIntro(); }});
  introOverlay.focus();
}

initApplication();