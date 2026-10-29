import {
  SKIN_TONES, clamp, eyeStyle, eyeColor, EYE_STYLES, EYE_MAX,
  hairStyle, hairColor, hairToSheet, HAIR_STYLES, HAIR_MAX, NOSE_STYLES
} from './data.js';
import { TINT, PALETTE_35, BIOME_NAMES, TEX, hexToFloats } from './tint.js';

const MAX_QUERY_ARGS = 90;

function processVillagerRecords(baseRecords, overrideRecords, lookupFn) {
  const allNames = [...new Set([...Object.keys(baseRecords), ...Object.keys(overrideRecords)])].sort();
  const regulars = {};
  const specials = {};

  for (const name of allNames) {
    const record = lookupFn(name);
    if (!record) continue;

    const eyeVal = clamp(record.e, 1, EYE_MAX);
    const eyeStyleName = eyeStyle(eyeVal);
    
    const hairVal = clamp(record.h, 0, HAIR_MAX);
    const hairStyleName = hairStyle(hairVal);

    const entry = {
      eyeValue: eyeVal,
      eyeStyleIdx: Math.max(0, EYE_STYLES.indexOf(eyeStyleName)),
      eyeColorIdx: clamp(eyeColor(eyeVal), 1, 34),
      outfitIdx: clamp(record.o, 1, 34),
      heightIdx: clamp(record.t, 1, 34),
      hairValue: hairVal,
      hairStyleIdx: hairStyleName === 'bald' ? 0 : HAIR_STYLES.indexOf(hairStyleName) + 1,
      hairColorIdx: hairStyleName === 'bald' ? 1 : clamp(hairColor(hairVal), 1, 35),
      noseIdx: clamp(record.n | 0, 0, NOSE_STYLES.length - 1),
      skinToneIdx: clamp(record.sk | 0, 0, SKIN_TONES.length - 1),
      gender: record.k || 'm',
      isSpecial: record.s ? 1 : 0
    };

    if (entry.isSpecial) {
      specials[name] = entry;
    } else {
      regulars[name] = entry;
    }
  }

  return { regulars, specials };
}

function createNameChunks(names) {
  const chunks = [];
  for (let i = 0; i < names.length; i += MAX_QUERY_ARGS) {
    const formattedNames = names.slice(i, i + MAX_QUERY_ARGS).map(n => `'${n}'`).join(', ');
    chunks.push(`query.is_name_any(${formattedNames})`);
  }
  return chunks;
}

function buildAssignStatements(variableName, groups, valueMapper) {
  const statements = [`${variableName} = -1;`];
  
  const sortedKeys = Object.keys(groups).map(Number).sort((a, b) => a - b);
  for (const key of sortedKeys) {
    const names = (groups[key] || []).slice().sort();
    for (const chunk of createNameChunks(names)) {
      statements.push(`${variableName} = ${chunk} ? ${valueMapper(key)} : ${variableName};`);
    }
  }
  return statements;
}

function buildColorStatements(variableName, groups, modulo) {
  return [
    ...buildAssignStatements(`variable.${variableName}`, groups, k => k),
    `variable.${variableName} = variable.${variableName} < 0 ? variable.${variableName}_base : (variable.is_special ? variable.${variableName} : math.mod((variable.${variableName} - 1) + (variable.${variableName}_base - 1), ${modulo}) + 1);`
  ];
}

function formatInlineRgb(idxVar, list, { k, a }) {
  const formatChannel = channelIdx => 
    list.slice(0, -1).map((color, i) => `${idxVar} == ${i + 1} ? ${+(color[channelIdx] * k).toFixed(4)}`).join(' : ')
    + ` : ${+(list[list.length - 1][channelIdx] * k).toFixed(4)}`;

  return { r: formatChannel(0), g: formatChannel(1), b: formatChannel(2), a: String(a) };
}

function buildEntityJson(manifest, textures, levelNames, numStyles, numEyeStyles, noseStmts) {
  return {
    format_version: '1.8.0',
    'minecraft:client_entity': {
      description: {
        identifier: 'minecraft:villager_v2',
        materials: {
          default: 'villager_v2',
          masked: 'villager_v2_masked',
          tinted: 'villager_v2'
        },
        textures,
        geometry: {
          default: 'geometry.villager_v2',
          ...Object.fromEntries(NOSE_STYLES.map(s => [`nose_${s}`, `geometry.villager_nose_${s}`]))
        },
        scripts: {
          scale: '(131 + (variable.height_c ? variable.height_c : 17)) / 160',
          pre_animation: [
            'variable.num_professions = 15;',
            'variable.num_tiers = 3;',
            'variable.profession_index = (query.variant < variable.num_professions ? query.variant : 0);',
            'variable.level_index = query.trade_tier;',
            'variable.prof_skin_seed = (variable.profession_index * 6) + query.skin_id;',
            'variable.combo_seed = (variable.profession_index * 42) + (query.mark_variant * 6) + query.skin_id;',
            'variable.outfit_shift = (variable.combo_seed * 7) + (query.skin_id * 3);',
            'variable.eye_shift = (variable.combo_seed * 13) + (query.skin_id * 11);',
            'variable.hair_shift = (variable.combo_seed * 19) + (query.skin_id * 17);',
            'variable.height_shift = (variable.combo_seed * 23) + (query.skin_id * 5);',
            'variable.style_shift = (variable.combo_seed * 5) + query.skin_id;',
            'variable.eye_style_shift = (variable.combo_seed * 3) + query.skin_id;',
            'variable.default_seed = math.abs((query.skin_id * 37) + (variable.profession_index * 17) + (query.mark_variant * 13));',
            'variable.out_c_base = math.mod((variable.default_seed * 7) + variable.outfit_shift, 34) + 1;',
            'variable.eye_c_base = math.mod(variable.default_seed + variable.eye_shift, 34) + 1;',
            'variable.hair_c_base = math.mod((variable.default_seed * 11) + variable.hair_shift, 35) + 1;',
            'variable.height_c_base = math.mod((variable.default_seed * 23) + variable.height_shift, 34) + 1;',
            `variable.hair_style_base = math.mod(variable.default_seed + variable.style_shift, ${numStyles}) + 1;`,
            `variable.eye_style_base = math.mod(variable.default_seed + variable.eye_style_shift, ${numEyeStyles});`,
            ...noseStmts
          ]
        },
        animations: {
          general: 'animation.villager.general',
          look_at_target: 'animation.common.look_at_target',
          move: 'animation.villager.move',
          raise_arms: 'animation.villager.raise_arms',
          baby_transform: 'animation.villager.baby_transform',
          get_in_bed: 'animation.villager.get_in_bed'
        },
        animation_controllers: [
          { general: 'controller.animation.villager_v2.general' },
          { move: 'controller.animation.villager_v2.move' },
          { raise_arms: 'controller.animation.villager_v2.raise_arms' },
          { baby: 'controller.animation.villager_v2.baby' }
        ],
        render_controllers: [
          'controller.render.villager_v2_base',
          'controller.render.villager_v2_skin',
          'controller.render.villager_v2_nose',
          'controller.render.villager_v2_eyes_white',
          'controller.render.villager_v2_eyes',
          'controller.render.villager_v2_hair',
          'controller.render.villager_v2_biome_tint',
          'controller.render.villager_v2_masked',
          'controller.render.villager_v2_level'
        ],
        spawn_egg: { texture: 'spawn_egg_villager' }
      }
    }
  };
}

export function generateBedrockFiles(manifest, baseRecords, overrideRecords, lookupFn, lookupTools) {
  const { regulars, specials } = processVillagerRecords(baseRecords, overrideRecords, lookupFn);

  const outfitAll = {}, eyeAll = {}, hairColorAll = {}, heightAll = {};
  for (let i = 1; i <= 35; i++) {
    if (i <= 34) {
      outfitAll[i] = []; eyeAll[i] = []; heightAll[i] = [];
    }
    hairColorAll[i] = [];
  }

  const eyeStyleNames = Array.from({ length: EYE_STYLES.length }, () => []);
  const styleNames = Array.from({ length: HAIR_STYLES.length + 1 }, () => []);
  const noseNames = Array.from({ length: NOSE_STYLES.length }, () => []);
  const skinNames = Array.from({ length: SKIN_TONES.length }, () => []);

  for (const [name, data] of Object.entries({ ...regulars, ...specials })) {
    outfitAll[data.outfitIdx].push(name);
    eyeAll[data.eyeColorIdx].push(name);
    eyeStyleNames[data.eyeStyleIdx].push(name);
    hairColorAll[data.hairColorIdx].push(name);
    heightAll[data.heightIdx].push(name);
    styleNames[data.hairStyleIdx].push(name);
    noseNames[data.noseIdx].push(name);
    if (data.skinToneIdx) skinNames[data.skinToneIdx].push(name);
  }

  const specialNames = Object.keys(specials).sort();
  const specialStmts = ['variable.is_special = 0;'];
  for (const chunk of createNameChunks(specialNames)) {
    specialStmts.push(`variable.is_special = ${chunk} ? 1 : variable.is_special;`);
  }

  const outStmts = buildColorStatements('out_c', outfitAll, 34);
  const eyeStmts = buildColorStatements('eye_c', eyeAll, 34);
  const hairColStmts = buildColorStatements('hair_c', hairColorAll, 35);
  const heightStmts = buildColorStatements('height_c', heightAll, 34);

  const numEyeStyles = EYE_STYLES.length;
  const eyeStyleGroups = Object.fromEntries(eyeStyleNames.map((list, i) => [i, list]));
  const eyeStyleStmts = [
    ...buildAssignStatements('variable.eye_style', eyeStyleGroups, k => k),
    `variable.eye_style = variable.eye_style < 0 ? variable.eye_style_base : (variable.is_special ? variable.eye_style : math.mod(variable.eye_style + variable.eye_style_base, ${numEyeStyles}));`
  ];

  const numStyles = HAIR_STYLES.length;
  const styleGroups = Object.fromEntries(styleNames.map((list, i) => [i, list]));
  const styleStmts = [
    ...buildAssignStatements('variable.hair_style', styleGroups, k => k),
    `variable.hair_style = variable.hair_style < 0 ? variable.hair_style_base : (variable.is_special || variable.hair_style == 0 ? variable.hair_style : math.mod((variable.hair_style - 1) + (variable.hair_style_base - 1), ${numStyles}) + 1);`
  ];

  const skinGroups = Object.fromEntries(skinNames.map((list, i) => [i, list]).filter(([i]) => i > 0));
  const skinStmts = [
    ...buildAssignStatements('variable.skin_tone', skinGroups, k => k),
    'variable.skin_tone = variable.skin_tone < 0 ? 0 : variable.skin_tone;'
  ];

  const numNoses = NOSE_STYLES.length;
  const noseGroups = Object.fromEntries(noseNames.map((list, i) => [i, list]));
  const noseStmts = [
    `variable.nose_shift = (variable.combo_seed * 29) + (query.skin_id * 7);`,
    `variable.nose_style_base = math.mod(variable.default_seed + variable.nose_shift, ${numNoses});`,
    ...specialStmts,
    ...buildAssignStatements('variable.nose_style', noseGroups, k => k),
    `variable.nose_style = variable.nose_style < 0 ? variable.nose_style_base : (variable.is_special ? variable.nose_style : math.mod(variable.nose_style + variable.nose_style_base, ${numNoses}));`
  ];

  const paletteFloats = PALETTE_35.map(hexToFloats);
  const eyeFloats = Array.from({ length: 34 }, (_, i) =>
    hexToFloats(lookupTools && lookupTools.eyeHex ? lookupTools.eyeHex(i + 1) : PALETTE_35[i])
  );

  const textures = {
    base: manifest.base, base2: manifest.base, base3: manifest.base, base4: manifest.base, base5: manifest.base, base6: manifest.base,
    hair_bald: TEX.hairBald,
    skin: TEX.skin
  };
  
  for (const style of EYE_STYLES) {
    textures[style === 'default' ? 'eyes_white' : `eyes_white_${style}`] = TEX.eyesWhite(style);
    textures[style === 'default' ? 'eyes_iris' : `eyes_iris_${style}`] = TEX.eyesIris(style);
  }
  for (const style of HAIR_STYLES) textures[`hair_${style}`] = TEX.hair(style);
  for (const style of NOSE_STYLES) textures[`nose_${style}`] = TEX.nose(style);
  for (const biome of BIOME_NAMES) {
    textures[biome] = TEX.shoes(biome);
    textures[`${biome}_tint`] = TEX.outfit(biome);
  }
  for (const prof of manifest.professions) textures[prof.id] = prof.path;
  const levelNames = ['level_stone', 'level_iron', 'level_gold', 'level_emerald', 'level_diamond'];
  levelNames.forEach((lvl, i) => textures[lvl] = manifest.levels[i]);

  const entityJson = buildEntityJson(manifest, textures, levelNames, numStyles, numEyeStyles, noseStmts);
  
  const rcJson = {
    format_version: '1.8.0',
    render_controllers: {
      'controller.render.villager_v2_base': {
        arrays: { textures: { 'Array.skins': ['Texture.base', 'Texture.base2', 'Texture.base3', 'Texture.base4', 'Texture.base5', 'Texture.base6'] } },
        geometry: 'Geometry.default',
        part_visibility: [{ '*': [...specialStmts, ...heightStmts, 'return 1;'].join(' ') }],
        materials: [{ '*': 'Material.default' }],
        textures: ['Array.skins[query.skin_id]']
      },
      'controller.render.villager_v2_skin': {
        geometry: 'Geometry.default',
        part_visibility: [{ '*': [...skinStmts, 'return 1;'].join(' ') }],
        materials: [{ '*': 'Material.tinted' }],
        textures: ['Texture.skin'],
        overlay_color: formatInlineRgb('(variable.skin_tone + 1)', SKIN_TONES.map(t => hexToFloats(t.hex)), TINT.skin)
      },
      'controller.render.villager_v2_nose': {
        arrays: {
          geometries: { 'Array.noses': NOSE_STYLES.map(s => `Geometry.nose_${s}`) },
          textures: { 'Array.nose_tex': NOSE_STYLES.map(s => `Texture.nose_${s}`) }
        },
        geometry: 'Array.noses[variable.nose_style]',
        materials: [{ '*': 'Material.default' }],
        textures: ['Array.nose_tex[variable.nose_style]']
      },
      'controller.render.villager_v2_biome_tint': {
        arrays: { textures: { 'Array.biome_tints': BIOME_NAMES.map(b => `Texture.${b}_tint`) } },
        geometry: 'Geometry.default',
        part_visibility: [{ '*': [...outStmts, 'return 1;'].join(' ') }],
        materials: [{ '*': 'Material.tinted' }],
        textures: ['Array.biome_tints[query.mark_variant]'],
        overlay_color: formatInlineRgb('variable.out_c', paletteFloats.slice(0, 34), TINT.outfit)
      },
      'controller.render.villager_v2_masked': {
        arrays: {
          textures: {
            'Array.biomes': BIOME_NAMES.map(b => `Texture.${b}`),
            'Array.professions': manifest.professions.map(p => `Texture.${p.id}`)
          }
        },
        geometry: 'Geometry.default',
        materials: [{ '*': '(query.is_baby || variable.profession_index == 0) ? Material.default : Material.masked' }],
        textures: ['Array.biomes[query.mark_variant]', 'Array.professions[variable.profession_index]']
      },
      'controller.render.villager_v2_level': {
        arrays: { textures: { 'Array.levels': levelNames.map(l => `Texture.${l}`) } },
        rebuild_animation_matrices: true,
        geometry: 'Geometry.default',
        part_visibility: [{ '*': '!query.is_baby && variable.profession_index != 0 && variable.profession_index != 14' }],
        materials: [{ '*': 'Material.default' }],
        textures: ['Array.levels[variable.level_index]']
      },
      'controller.render.villager_v2_eyes_white': {
        arrays: { textures: { 'Array.eyes_white': EYE_STYLES.map(es => es === 'default' ? 'Texture.eyes_white' : `Texture.eyes_white_${es}`) } },
        geometry: 'Geometry.default',
        part_visibility: [{ '*': [...eyeStyleStmts, 'return 1;'].join(' ') }],
        materials: [{ '*': 'Material.default' }],
        textures: ['Array.eyes_white[variable.eye_style]']
      },
      'controller.render.villager_v2_eyes': {
        arrays: { textures: { 'Array.eyes': EYE_STYLES.map(es => es === 'default' ? 'Texture.eyes_iris' : `Texture.eyes_iris_${es}`) } },
        geometry: 'Geometry.default',
        part_visibility: [{ '*': [...eyeStmts, 'return 1;'].join(' ') }],
        materials: [{ '*': 'Material.tinted' }],
        textures: ['Array.eyes[variable.eye_style]'],
        overlay_color: formatInlineRgb('variable.eye_c', eyeFloats, TINT.eyes)
      },
      'controller.render.villager_v2_hair': {
        arrays: { textures: { 'Array.hair': ['Texture.hair_bald', ...HAIR_STYLES.map(st => `Texture.hair_${st}`)] } },
        geometry: 'Geometry.default',
        part_visibility: [{ '*': [...hairColStmts, ...styleStmts, 'return 1;'].join(' ') }],
        materials: [{ '*': 'Material.tinted' }],
        textures: ['Array.hair[variable.hair_style]'],
        overlay_color: formatInlineRgb('variable.hair_c', paletteFloats, TINT.hair)
      }
    }
  };

  return {
    entityJson,
    rcJson,
    stats: { regularCount: Object.keys(regulars).length, specialCount: specialNames.length }
  };
}

export function generateCSVText(baseRecords, overrideRecords, lookupFn) {
  const allNames = [...new Set([...Object.keys(baseRecords), ...Object.keys(overrideRecords)])].sort();
  
  const columns = {
    maleReg: [], femaleReg: [],
    maleSpec: [], femaleSpec: []
  };

  for (const name of allNames) {
    const record = lookupFn(name);
    if (!record) continue;

    const row = [
      record.s ? `${name}*` : name, 
      record.e, 
      hairToSheet(record.h, record.k, record.s), 
      record.t, 
      record.o
    ];

    if (record.s) {
      record.k === 'f' ? columns.femaleSpec.push(row) : columns.maleSpec.push(row);
    } else {
      record.k === 'f' ? columns.femaleReg.push(row) : columns.maleReg.push(row);
    }
  }

  const maxRows = Math.max(
    columns.maleReg.length, 
    columns.femaleReg.length, 
    columns.maleSpec.length, 
    columns.femaleSpec.length
  );
  
  const lines = ['MALE,EYES,HAIR,HEIGHT,OUTFIT,FEMALE,EYES,HAIR,HEIGHT,OUTFIT,MALESPECIAL,EYES,HAIR,HEIGHT,OUTFIT,FEMALESPECIAL,EYES,HAIR,HEIGHT,OUTFIT'];
  
  const emptyRow = ['', '', '', '', ''];
  for (let i = 0; i < maxRows; i++) {
    lines.push([
      ...(columns.maleReg[i] || emptyRow),
      ...(columns.femaleReg[i] || emptyRow),
      ...(columns.maleSpec[i] || emptyRow),
      ...(columns.femaleSpec[i] || emptyRow)
    ].join(','));
  }
  
  return lines.join('\n');
}