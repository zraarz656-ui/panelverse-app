import { SpeechBubbleOverlay } from './types';

export function ensureProxiedSrc(src: string): string {
  if (!src) return '';
  if (
    src.startsWith('data:') ||
    src.startsWith('/') ||
    src.includes('/api/image-proxy')
  ) {
    return src;
  }
  return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}

/**
 * Samples the dominant interior background color of a speech bubble around the text box
 * so erasing the original foreign text blends seamlessly into the original bubble.
 */
export function sampleBubbleColors(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  canvasW: number,
  canvasH: number
): { bgHex: string; textHex: string } {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.max(4, Math.min(canvasW - sx, Math.ceil(w)));
  const sh = Math.max(4, Math.min(canvasH - sy, Math.ceil(h)));

  try {
    const imgData = ctx.getImageData(sx, sy, sw, sh).data;
    let lightCount = 0;
    let darkCount = 0;
    let rLight = 0,
      gLight = 0,
      bLight = 0;
    let rDark = 0,
      gDark = 0,
      bDark = 0;

    const step = Math.max(4, Math.floor((sw * sh) / 250) * 4);
    for (let i = 0; i < imgData.length; i += step) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum >= 145) {
        lightCount++;
        rLight += r;
        gLight += g;
        bLight += b;
      } else if (lum <= 95) {
        darkCount++;
        rDark += r;
        gDark += g;
        bDark += b;
      }
    }

    const toHex = (n: number) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0');

    if (darkCount > lightCount * 1.35 && darkCount > 0) {
      const rAvg = rDark / darkCount;
      const gAvg = gDark / darkCount;
      const bAvg = bDark / darkCount;
      return {
        bgHex: `#${toHex(rAvg)}${toHex(gAvg)}${toHex(bAvg)}`,
        textHex: '#ffffff',
      };
    }

    if (lightCount > 0) {
      const rAvg = rLight / lightCount;
      const gAvg = gLight / lightCount;
      const bAvg = bLight / lightCount;
      if (rAvg > 235 && gAvg > 235 && bAvg > 235) {
        return { bgHex: '#ffffff', textHex: '#09090b' };
      }
      return {
        bgHex: `#${toHex(rAvg)}${toHex(gAvg)}${toHex(bAvg)}`,
        textHex: '#09090b',
      };
    }
  } catch {
    // Fallback if getImageData fails
  }

  return { bgHex: '#ffffff', textHex: '#09090b' };
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split(/\n+/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = `${currentLine} ${word}`;
      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [text];
}

/**
 * Renders the original page image + clean, borderless inpainted speech bubbles
 * in authentic comic typography directly onto a canvas and returns a data URL.
 */
export function renderCleanTranslatedPageToDataUrl(
  imgEl: HTMLImageElement,
  bubbles: SpeechBubbleOverlay[],
  languageCode: string
): string {
  const w = imgEl.naturalWidth || imgEl.width || 800;
  const h = imgEl.naturalHeight || imgEl.height || 1200;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return imgEl.src;

  ctx.drawImage(imgEl, 0, 0, w, h);

  if (!bubbles || bubbles.length === 0) {
    return canvas.toDataURL('image/webp', 0.92);
  }

  const isEnglish = languageCode === 'en';
  const fontFamily = isEnglish
    ? '"Comic Sans MS", "Chalkboard SE", "Bangers", system-ui, sans-serif'
    : '"Noto Sans Malayalam", "Manjari", system-ui, sans-serif';

  for (const bubble of bubbles) {
    const rawText = (bubble.translatedText || '').trim();
    if (!rawText || rawText === 'Translating...') continue;

    const bx = (bubble.box.xPercent / 100) * w;
    const by = (bubble.box.yPercent / 100) * h;
    const bw = Math.max(24, (bubble.box.wPercent / 100) * w);
    const bh = Math.max(20, (bubble.box.hPercent / 100) * h);

    const bgFill = bubble.backgroundColor || '#ffffff';
    const textFill = bubble.textColor || '#09090b';

    ctx.save();
    const padX = Math.min(bw * 0.08, 10);
    const padY = Math.min(bh * 0.08, 10);
    const rx = bx - padX * 0.5;
    const ry = by - padY * 0.5;
    const rw = bw + padX;
    const rh = bh + padY;
    const radius = Math.min(rw, rh) * 0.35;

    ctx.filter = 'blur(4px)';
    ctx.fillStyle = bgFill;
    ctx.beginPath();
    ctx.roundRect(rx, ry, rw, rh, radius);
    ctx.fill();
    ctx.filter = 'none';

    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, Math.min(bw, bh) * 0.28);
    ctx.fill();
    ctx.restore();

    const displayText = isEnglish ? rawText.toUpperCase() : rawText;
    const userScale = (bubble.fontSize || 14) / 14;

    const maxTextWidth = bw * 0.92;
    const maxTextHeight = bh * 0.92;

    let bestFontSize = Math.max(11, Math.min(Math.round(w * 0.022), 34));
    let wrappedLines: string[] = [displayText];

    for (let testSize = Math.min(38, Math.round(bh * 0.55)); testSize >= 10; testSize -= 1) {
      ctx.font = `800 ${testSize}px ${fontFamily}`;
      const candidateLines = wrapCanvasText(ctx, displayText, maxTextWidth);
      const lineHeight = testSize * 1.18;
      const totalH = candidateLines.length * lineHeight;
      const widestLine = Math.max(
        ...candidateLines.map((l) => ctx.measureText(l).width)
      );
      if (totalH <= maxTextHeight && widestLine <= maxTextWidth) {
        bestFontSize = testSize;
        wrappedLines = candidateLines;
        break;
      }
      wrappedLines = candidateLines;
      bestFontSize = testSize;
    }

    const finalFontSize = Math.max(9, Math.round(bestFontSize * userScale));
    ctx.save();
    ctx.font = `800 ${finalFontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    wrappedLines = wrapCanvasText(ctx, displayText, maxTextWidth);
    const lineHeight = finalFontSize * 1.18;
    const totalBlockHeight = wrappedLines.length * lineHeight;
    const centerX = bx + bw / 2;
    const startY = by + bh / 2 - totalBlockHeight / 2 + lineHeight / 2;

    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, Math.round(finalFontSize * 0.22));
    ctx.strokeStyle = bgFill;
    ctx.fillStyle = textFill;

    wrappedLines.forEach((line, idx) => {
      const ly = startY + idx * lineHeight;
      ctx.strokeText(line, centerX, ly);
      ctx.fillText(line, centerX, ly);
    });
    ctx.restore();
  }

  return canvas.toDataURL('image/webp', 0.92);
}

/**
 * Creates a high-contrast B&W speech-bubble text-only version of a comic canvas slice.
 * Neutralizes colored/skin-tone artwork into white while preserving dark/light speech bubble text
 * so AI Vision OCR never gets blocked by mature illustrations.
 */
export function createHighContrastTextOnlyCanvasDataUrl(
  sourceCanvas: HTMLCanvasElement
): string {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) return sourceCanvas.toDataURL('image/jpeg', 0.85);

  ctx.drawImage(sourceCanvas, 0, 0);
  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const chroma = maxC - minC;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Colored artwork / skin tones have higher chroma or mid-tone luminance -> bleach to pure white
      if (chroma > 35 || (lum > 85 && lum < 205)) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else if (lum <= 85) {
        // Crisp dark ink / text letters
        data[i] = 10;
        data[i + 1] = 10;
        data[i + 2] = 10;
      } else {
        // Pure white bubble interior
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Fallback if pixel manipulation fails
  }

  return outCanvas.toDataURL('image/jpeg', 0.85);
}

