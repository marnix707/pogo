/**
 * A screenshot of the page for a bug report: the DOM drawn to a canvas by `html-to-image` (loaded only when it is
 * needed), downscaled and compressed so it stays a few hundred KB. Returns null when it cannot be taken: the report
 * is then sent without one.
 */
const MAX_EDGE = 900;
const MAX_BYTES = 300_000;

export async function captureScreenshot(): Promise<string | null> {
  try {
    const { toCanvas } = await import('html-to-image');
    const canvas = await Promise.race([
      toCanvas(document.body, { pixelRatio: 1, cacheBust: false }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (!canvas) return null;
    const scale = Math.min(1, MAX_EDGE / Math.max(canvas.width, canvas.height));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(canvas.width * scale));
    out.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    // (JPEG has no transparency: whatever the page left transparent (the page colour sits on <html>, which is not
    // drawn) came out black. Paint the page colour first.)
    ctx.fillStyle = getComputedStyle(document.documentElement).backgroundColor || '#1b2340';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.imageSmoothingEnabled = false; // (pixel art)
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    for (const quality of [0.72, 0.55, 0.4]) {
      const url = out.toDataURL('image/jpeg', quality);
      // (a base64 data URL is about 4/3 of the picture)
      if ((url.length * 3) / 4 <= MAX_BYTES) return url;
    }
    return null;
  } catch {
    return null;
  }
}
