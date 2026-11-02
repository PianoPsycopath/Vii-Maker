import {
  HEX, SKINS, eyeStyle, eyeRange, EYE_STYLES,
  hairStyle, hairRange, HAIR_STYLES, NOSE_STYLES, SKIN_TONES, COLOR_COUNT
} from '../data.js';
import { BIOME_NAMES } from '../tint.js';
import { buildSwatchGrid, buildTextureGrid, applyGridThumbnails } from './GridBuilder.js';
import { capitalize, formatIdentifier } from './format.js';

function rangeItems([start, end], describe) {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => describe(start + i));
}

export class EditorGrids {
  constructor({ elements, manifest, lookups, callbacks }) {
    this.elements = elements;
    this.manifest = manifest;
    this.lookups = lookups;
    this.callbacks = callbacks;
    this.resetStyleCache();
  }

  build() {
    this.buildStyleSelectors();
    this.buildColorGrids();
    this.buildPreviewGrids();
  }

  buildStyleSelectors() {
    const { elements, callbacks } = this;

    buildTextureGrid(
      elements.eyesSegment,
      EYE_STYLES.map(style => ({
        val: style,
        s: style,
        label: capitalize(style),
        title: `Eye Style: ${capitalize(style)}`
      })),
      style => callbacks.onSelectEyeStyle(style)
    );

    buildTextureGrid(
      elements.hairSegment,
      ['bald', ...HAIR_STYLES].map(style => ({
        val: style,
        s: style,
        label: capitalize(style),
        title: `Hair Style: ${capitalize(style)}`
      })),
      style => callbacks.onSelectHairStyle(style)
    );

    buildTextureGrid(
      elements.noseSegment,
      NOSE_STYLES.map((style, index) => ({
        val: index,
        s: style,
        label: capitalize(style),
        title: `Nose Style: ${capitalize(style)}`
      })),
      index => callbacks.onPatchLook({ n: index })
    );
  }

  buildColorGrids() {
    const { elements, manifest, callbacks } = this;

    buildSwatchGrid(
      elements.outfitGrid,
      Array.from({ length: COLOR_COUNT }, (_, index) => ({
        val: index + 1,
        hex: HEX[manifest.colors[index]],
        title: `${index + 1} ${manifest.colors[index]}`
      })),
      val => callbacks.onPatchLook({ o: val })
    );

    buildSwatchGrid(
      elements.skinToneGrid,
      SKIN_TONES.map((tone, index) => ({
        val: index,
        hex: tone.hex,
        title: `${index} ${tone.name}`
      })),
      val => callbacks.onSelectSkinTone(val)
    );
  }

  buildPreviewGrids() {
    const { elements, manifest, callbacks } = this;

    buildTextureGrid(
      elements.profGrid,
      manifest.professions.map((prof, index) => ({
        val: index,
        label: formatIdentifier(prof.id),
        title: `${index}: ${formatIdentifier(prof.id)}`
      })),
      val => callbacks.onUpdatePreviewConfig({ prof: val })
    );

    buildTextureGrid(
      elements.biomeGrid,
      BIOME_NAMES.map((biome, index) => ({
        val: index,
        label: formatIdentifier(biome),
        title: `${index}: ${formatIdentifier(biome)}`
      })),
      val => callbacks.onUpdatePreviewConfig({ biome: val })
    );

    buildTextureGrid(
      elements.skinGrid,
      SKINS.map((_, index) => ({
        val: index,
        label: `Skin ${index}`,
        title: `Skin ID ${index}`
      })),
      val => callbacks.onUpdatePreviewConfig({ skin: val })
    );
  }

  syncStyleColors(simulation) {
    const eye = eyeStyle(simulation.e);
    const hair = hairStyle(simulation.h);

    if (hair !== this.hairStyleName) {
      this.buildHairColors(simulation.h);
      this.hairStyleName = hair;
    }
    if (eye !== this.eyeStyleName) {
      this.buildEyeColors(simulation.e);
      this.eyeStyleName = eye;
    }
  }

  buildEyeColors(renderedEye) {
    const { lookups, callbacks, elements } = this;
    const style = eyeStyle(renderedEye);
    const items = rangeItems(eyeRange(style), val => ({
      val,
      hex: lookups.eyeHex(val),
      title: `${val} (${style} ${lookups.eyeName(val)})`
    }));
    buildSwatchGrid(elements.eyesGrid, items, val => callbacks.onPatchLook({ e: val }));
  }

  buildHairColors(renderedHair) {
    const { lookups, callbacks, elements } = this;
    const items = rangeItems(hairRange(hairStyle(renderedHair)), val => ({
      val,
      hex: lookups.hairHex(val),
      title: `${val} ${lookups.hairName(val)}`
    }));
    buildSwatchGrid(elements.hairGrid, items, val => callbacks.onPatchLook({ h: val }));
  }

  applyThumbnails(thumbs) {
    const { elements } = this;
    applyGridThumbnails(elements.profGrid, thumbs.profThumbs);
    applyGridThumbnails(elements.biomeGrid, thumbs.biomeThumbs);
    applyGridThumbnails(elements.skinGrid, thumbs.skinThumbs);
    applyGridThumbnails(elements.hairSegment, thumbs.hairThumbs);
    applyGridThumbnails(elements.eyesSegment, thumbs.eyeThumbs);
    applyGridThumbnails(elements.noseSegment, thumbs.noseThumbs);
  }

  resetStyleCache() {
    this.hairStyleName = null;
    this.eyeStyleName = null;
  }
}