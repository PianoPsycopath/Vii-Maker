import {
  buildBedrockFiles, loadTextures, describeMissingTextures, pickResourcePackRoot,
  zipSimple, zipAddon, weaveIntoPack
} from '../PackExport.js';
import { createComposer } from '../composer.js';
import { generatePackIcon, PACK_ICON_VILLAGER } from '../PackIcon.js';
import { triggerDownload } from './download.js';

const SIMPLE_ARCHIVE = 'villager_bedrock_rp.zip';
const ADDON_ARCHIVE = 'Vii-Maker_Villagers.mcaddon';

export class ExportService {
  constructor({ appData, state, lookups, setStatus }) {
    this.appData = appData;
    this.state = state;
    this.lookups = lookups;
    this.setStatus = setStatus;
    this.iconComposer = null;
  }

  exportEdits() {
    triggerDownload(this.appData.over, 'villager-edits.json');
  }

  exportAll() {
    const { base, over } = this.appData;
    const names = Object.keys({ ...base, ...over }).sort();
    triggerDownload(Object.fromEntries(names.map(name => [name, this.state.lookup(name)])), 'villagers-all.json');
  }

  async exportBedrockRP(mode = 'simple') {
    try {
      const root = mode === 'weave' ? await pickResourcePackRoot() : null;
      const { json, texturePaths, stats } = this.buildFiles();
      const counts = `${stats.regularCount} shifted regulars + ${stats.specialCount} locked specials`;

      if (mode === 'simple') {
        triggerDownload(zipSimple(json), SIMPLE_ARCHIVE);
        this.setStatus(`Exported ${SIMPLE_ARCHIVE} (${counts}).`);
        return;
      }

      this.setStatus('Collecting textures...');
      const { files, missing } = await loadTextures(texturePaths);
      if (!Object.keys(files).length) {
        throw new Error('No textures could be loaded, so nothing was written. Check the texture location.');
      }
      const missingNote = describeMissingTextures(missing);

      if (mode === 'weave') await this.weave(root, json, files, counts, missingNote);
      else await this.exportAddon(json, files, counts, missingNote);
    } catch (error) {
      if (error.name === 'AbortError') {
        this.setStatus('Export cancelled.');
        return;
      }
      console.error('Bedrock export failed', error);
      this.setStatus(`Export failed: ${error.message}`);
    }
  }

  buildFiles() {
    return buildBedrockFiles({
      manifest: this.appData.M,
      base: this.appData.base,
      over: this.appData.over,
      lookup: this.state.lookup.bind(this.state),
      lookups: this.lookups,
      GEO: this.appData.GEO
    });
  }

  async weave(root, json, files, counts, missingNote) {
    const written = await weaveIntoPack(root, json, files);
    this.setStatus(`Wove ${written} files into "${root.name}" (${counts}).${missingNote}`);
  }

  async exportAddon(json, files, counts, missingNote) {
    const icon = await this.buildPackIcon();
    const packFiles = icon.bytes ? { ...files, 'pack_icon.png': icon.bytes } : files;
    triggerDownload(zipAddon(json, packFiles), ADDON_ARCHIVE);
    this.setStatus(`Exported ${ADDON_ARCHIVE} (${counts}).${missingNote}${icon.note}`);
  }

  async buildPackIcon() {
    try {
      this.iconComposer ??= createComposer({ M: this.appData.M, lookups: this.lookups });
      const bytes = await generatePackIcon({
        GEO: this.appData.GEO,
        M: this.appData.M,
        composer: this.iconComposer,
        lookup: this.state.lookup.bind(this.state)
      });
      return bytes
        ? { bytes, note: '' }
        : { bytes: null, note: ` No pack icon: villager "${PACK_ICON_VILLAGER.name}" not found.` };
    } catch (error) {
      console.warn('Pack icon failed', error);
      return { bytes: null, note: ' Pack icon could not be generated.' };
    }
  }
}