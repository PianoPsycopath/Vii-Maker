export function parseTGA(buffer) {
  const dataView = new DataView(buffer);
  if (buffer.byteLength < 18) return null;

  const idLen = dataView.getUint8(0);
  const colorMapType = dataView.getUint8(1);
  const imageType = dataView.getUint8(2);
  const cmFirst = dataView.getUint16(3, true);
  const cmLen = dataView.getUint16(5, true);
  const cmBpp = dataView.getUint8(7);
  const width = dataView.getUint16(12, true);
  const height = dataView.getUint16(14, true);
  const pixelDepth = dataView.getUint8(16);
  const descriptor = dataView.getUint8(17);

  if (!width || !height) return null;
  
  const bytesPerPixel = pixelDepth >> 3;
  if (![1, 3, 4].includes(bytesPerPixel)) return null;

  let offset = 18 + idLen;
  const cmBytesPerEntry = cmBpp >> 3;
  const paletteOffset = offset;
  
  if (colorMapType === 1) {
    offset += cmLen * cmBytesPerEntry;
  }

  const bytes = new Uint8Array(buffer);
  const totalPixels = width * height;
  const rawPixelData = new Uint8Array(totalPixels * 4);

  const readColor = (pos, bpp, outIdx) => {
    if (colorMapType === 1 && bpp === 1) {
      const idx = bytes[pos] - cmFirst;
      const pPos = paletteOffset + idx * cmBytesPerEntry;
      rawPixelData[outIdx]     = bytes[pPos + 2] || 0;
      rawPixelData[outIdx + 1] = bytes[pPos + 1] || 0;
      rawPixelData[outIdx + 2] = bytes[pPos]     || 0;
      rawPixelData[outIdx + 3] = cmBytesPerEntry === 4 ? bytes[pPos + 3] : 255;
    } else if (bpp === 1) {
      const gray = bytes[pos];
      rawPixelData[outIdx] = rawPixelData[outIdx + 1] = rawPixelData[outIdx + 2] = gray;
      rawPixelData[outIdx + 3] = 255;
    } else {
      rawPixelData[outIdx]     = bytes[pos + 2];
      rawPixelData[outIdx + 1] = bytes[pos + 1];
      rawPixelData[outIdx + 2] = bytes[pos];
      rawPixelData[outIdx + 3] = bpp === 4 ? bytes[pos + 3] : 255;
    }
  };

  if (imageType === 1 || imageType === 2 || imageType === 3) {
    for (let i = 0; i < totalPixels; i++) {
      readColor(offset + i * bytesPerPixel, bytesPerPixel, i * 4);
    }
  } 
  else if (imageType === 9 || imageType === 10 || imageType === 11) {
    let pix = 0;
    while (pix < totalPixels && offset < bytes.length) {
      const header = bytes[offset++];
      const count = (header & 0x7f) + 1;
      if (header & 0x80) {
        for (let i = 0; i < count && pix < totalPixels; i++, pix++) {
          readColor(offset, bytesPerPixel, pix * 4);
        }
        offset += bytesPerPixel;
      } else {
        for (let i = 0; i < count && pix < totalPixels; i++, pix++) {
          readColor(offset, bytesPerPixel, pix * 4);
          offset += bytesPerPixel;
        }
      }
    }
  } else {
    return null;
  }

  // 32-bit files whose alpha is entirely zero are treated as opaque wherever they have color.
  if (bytesPerPixel === 4) {
    let hasAlpha = false;
    for (let i = 3; i < rawPixelData.length; i += 4) {
      if (rawPixelData[i] > 0) { hasAlpha = true; break; }
    }
    if (!hasAlpha) {
      for (let i = 0; i < rawPixelData.length; i += 4) {
        rawPixelData[i + 3] = (rawPixelData[i] || rawPixelData[i + 1] || rawPixelData[i + 2]) ? 255 : 0;
      }
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(width, height);
  const dst = imgData.data;

  const topToBottom = (descriptor & 0x20) !== 0;
  const rightToLeft = (descriptor & 0x10) !== 0;

  for (let y = 0; y < height; y++) {
    const srcY = topToBottom ? y : (height - 1 - y);
    for (let x = 0; x < width; x++) {
      const srcX = rightToLeft ? (width - 1 - x) : x;
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * width + x) * 4;
      dst[dstIdx]     = rawPixelData[srcIdx];
      dst[dstIdx + 1] = rawPixelData[srcIdx + 1];
      dst[dstIdx + 2] = rawPixelData[srcIdx + 2];
      dst[dstIdx + 3] = rawPixelData[srcIdx + 3];
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}