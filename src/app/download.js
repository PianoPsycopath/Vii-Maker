import { toFileText } from '../PackExport.js';

const REVOKE_DELAY_MS = 10000;

export function triggerDownload(content, filename) {
  const payload = content instanceof Uint8Array ? content : toFileText(content);
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([payload], { type: 'application/octet-stream' }));
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), REVOKE_DELAY_MS);
}