// k darkens the tint color (multiply feel), a is the tint opacity.
export const TINT = {
  outfit: { k: 0.72, a: 0.80 },
  hair:   { k: 0.58, a: 0.80 },
  eyes:   { k: 0.85, a: 0.90 },
  skin:   { k: 1.00, a: 0.90 }
};

export const PALETTE_35 = [
  '#efe1bb', '#fbe28a', '#dfbe7a', '#c7962d', '#ad7a49', 
  '#eb983f', '#e99027', '#8a6294', '#a1570b', '#933f1e', 
  '#6e2800', '#441600', '#7b5028', '#654529', '#ede5f8', 
  '#442711', '#2e180e', '#2f2f2f', '#2c1a1a', '#202832', 
  '#281928', '#1b110d', '#646775', '#9698a2', '#ed8dac', 
  '#ed8dac', '#792aac', '#35399d', '#3aafd9', '#158991', 
  '#546d1b', '#70b919', '#f8c627', '#d87d3e', '#a12722'
];

export const BIOME_NAMES = ['plains', 'desert', 'jungle', 'savanna', 'snow', 'swamp', 'taiga'];

const RESOURCE_PATH = 'textures/entity/villager2';

export const TEX = {
  hair: (style) => `${RESOURCE_PATH}/hair/${style}-`,
  hairBald: `${RESOURCE_PATH}/hair/bald`,
  nose: (style) => `${RESOURCE_PATH}/nose/${style}_nose`,
  skin: `${RESOURCE_PATH}/villager_skin`,
  outfit: (biome) => `${RESOURCE_PATH}/biomes/biome_${biome}-`,
  shoes: (biome) => `${RESOURCE_PATH}/biomes/biome_${biome}-shoes`,
  eyesWhite: (style) => (!style || style === 'default') ? `${RESOURCE_PATH}/eyes/eyes_white` : `${RESOURCE_PATH}/eyes/eyes_white_${style}`,
  eyesIris: (style) => (!style || style === 'default') ? `${RESOURCE_PATH}/eyes/eyes_iris` : `${RESOURCE_PATH}/eyes/eyes_iris_${style}`
};

export function hexToFloats(hex) {
  const normalizedHex = (hex || '#ffffff').replace('#', '');
  return [
    +(parseInt(normalizedHex.slice(0, 2), 16) / 255).toFixed(4),
    +(parseInt(normalizedHex.slice(2, 4), 16) / 255).toFixed(4),
    +(parseInt(normalizedHex.slice(4, 6), 16) / 255).toFixed(4)
  ];
}

// Mutates `data` in place; alpha is left untouched.
export function applyOverlayTint(data, rgb, { k, a }) {
  const blendAdd = rgb.map(c => c * k * a * 255);
  const blendKeep = 1 - a;

  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    data[i]     = data[i] * blendKeep + blendAdd[0];
    data[i + 1] = data[i + 1] * blendKeep + blendAdd[1];
    data[i + 2] = data[i + 2] * blendKeep + blendAdd[2];
  }
  return data;
}