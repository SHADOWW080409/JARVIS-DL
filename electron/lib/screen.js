const { desktopCapturer, screen } = require('electron');

// Capture the primary display. `full` is a physical-resolution NativeImage;
// base64/width/height describe a downscaled JPEG suitable for sending to a model.
async function capture(maxW = 1280) {
  const d = screen.getPrimaryDisplay();
  const sf = d.scaleFactor || 1;
  const pw = Math.round(d.size.width * sf);
  const ph = Math.round(d.size.height * sf);
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: pw, height: ph } });
  const src = sources.find((s) => String(s.display_id) === String(d.id)) || sources[0];
  if (!src) throw new Error('Could not capture the screen.');
  const full = src.thumbnail;
  const size = full.getSize();
  const scale = Math.min(1, maxW / size.width);
  const img = scale < 1 ? full.resize({ width: Math.round(size.width * scale) }) : full;
  const is = img.getSize();
  return {
    full,
    base64: img.toJPEG(70).toString('base64'),
    mime: 'image/jpeg',
    width: is.width,
    height: is.height,
    physW: size.width,
    physH: size.height,
    scaleFactor: sf,
  };
}

// Crop a region given in display (DIP) coordinates; returns {base64, mime} or null.
function cropRegion(shot, bbox, pad = 24) {
  if (!bbox) return null;
  const sf = shot.scaleFactor;
  let x = Math.floor(bbox.x * sf) - pad;
  let y = Math.floor(bbox.y * sf) - pad;
  let w = Math.ceil(bbox.w * sf) + pad * 2;
  let h = Math.ceil(bbox.h * sf) + pad * 2;
  x = Math.max(0, x);
  y = Math.max(0, y);
  w = Math.min(shot.physW - x, Math.max(w, 80));
  h = Math.min(shot.physH - y, Math.max(h, 80));
  if (w < 10 || h < 10) return null;
  const img = shot.full.crop({ x, y, width: w, height: h });
  return { base64: img.toJPEG(85).toString('base64'), mime: 'image/jpeg' };
}

module.exports = { capture, cropRegion };
