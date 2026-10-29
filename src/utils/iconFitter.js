function loadImgWithFallbacks(img) {
  const candidates = [
    img.getAttribute('src'),
    ...(img.dataset.fallbacks ? img.dataset.fallbacks.split(',').map(s => s.trim()) : [])
  ].filter(Boolean);

  return new Promise(resolve => {
    let index = 0;
    const tryNext = () => {
      if (index >= candidates.length) { 
        resolve(null); 
        return; 
      }
      const src = candidates[index++];
      const probe = new Image();
      probe.onload = () => resolve({ im: probe, src });
      probe.onerror = tryNext;
      probe.src = src;
    };
    tryNext();
  });
}

export function fitTabIcons() {
  const CANVAS_SIZE = 512;
  const OUTPUT_SIZE = 256;
  const FILL_RATIO = 0.76;

  document.querySelectorAll('.mii-tab img').forEach(async img => {
    try {
      const loaded = await loadImgWithFallbacks(img);
      if (!loaded) return;

      const { src } = loaded;
      let { im } = loaded;
      const isSvg = /\.svg$/i.test(src);
      let aspectRatio = im.naturalWidth > 0 ? im.naturalHeight / im.naturalWidth : 1;

      if (isSvg) {
        const text = await (await fetch(src)).text();
        const viewBoxMatch = text.match(/viewBox=["']([^"']+)["']/);
        const viewBox = viewBoxMatch ? viewBoxMatch[1].trim().split(/[\s,]+/).map(Number) : null;
        
        if (viewBox && viewBox[2] > 0 && viewBox[3] > 0) {
          aspectRatio = viewBox[3] / viewBox[2];
        }
        
        const blobUrl = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
        const svgImg = new Image();
        await new Promise((resolve, reject) => { 
          svgImg.onload = resolve; 
          svgImg.onerror = reject; 
          svgImg.src = blobUrl; 
        });
        URL.revokeObjectURL(blobUrl);
        im = svgImg;
      }

      const canvasHeight = Math.max(1, Math.round(CANVAS_SIZE * (aspectRatio || 1)));
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_SIZE;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(im, 0, 0, CANVAS_SIZE, canvasHeight);

      const imgData = ctx.getImageData(0, 0, CANVAS_SIZE, canvasHeight);
      const data = imgData.data;

      // Enhance dark ink to white for SVGs
      if (isSvg) {
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha <= 20) { 
            data[i + 3] = 0; 
            continue; 
          }
          const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          if (luminance < 52) {
            const transition = Math.min(1, Math.max(0, (52 - luminance) / 20));
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = Math.round(alpha * transition);
          } else {
            data[i + 3] = 0;
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }

      let minX = CANVAS_SIZE, minY = canvasHeight, maxX = -1, maxY = -1;
      for (let y = 0; y < canvasHeight; y++) {
        for (let x = 0; x < CANVAS_SIZE; x++) {
          const alpha = data[(y * CANVAS_SIZE + x) * 4 + 3];
          if (alpha > 40) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return;

      const boundWidth = maxX - minX + 1;
      const boundHeight = maxY - minY + 1;
      const maxBoxSize = OUTPUT_SIZE * FILL_RATIO;
      const scale = Math.min(maxBoxSize / boundWidth, maxBoxSize / boundHeight);
      
      const drawWidth = boundWidth * scale;
      const drawHeight = boundHeight * scale;
      const drawX = (OUTPUT_SIZE - drawWidth) / 2;
      const drawY = (OUTPUT_SIZE - drawHeight) / 2;

      const outCanvas = document.createElement('canvas');
      outCanvas.width = OUTPUT_SIZE;
      outCanvas.height = OUTPUT_SIZE;
      const outCtx = outCanvas.getContext('2d');
      outCtx.drawImage(canvas, minX, minY, boundWidth, boundHeight, drawX, drawY, drawWidth, drawHeight);

      img.classList.add('fitted');
      img.style.transform = '';
      img.style.transformOrigin = '';
      img.src = outCanvas.toDataURL('image/png');
    } catch (error) {
      console.warn('Could not center icon', img.src, error);
    }
  });
}