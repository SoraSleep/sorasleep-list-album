let mirror: HTMLCanvasElement | null = null;
let mirrorPen: CanvasRenderingContext2D | null = null;
let shifted: ImageData | null = null;
let baked: HTMLCanvasElement | null = null;
let bakedPen: CanvasRenderingContext2D | null = null;
let bakedKey = "";

function mirrorLayer(w: number, h: number) {
  if (typeof document === "undefined") return null;
  mirror ??= document.createElement("canvas");
  mirrorPen ??= mirror.getContext("2d", { willReadFrequently: true });
  if (!mirrorPen) return null;
  const W = Math.max(2, Math.round(w));
  const H = Math.max(2, Math.round(h));
  if (mirror.width !== W || mirror.height !== H) {
    mirror.width = W;
    mirror.height = H;
    shifted = null;
  }
  return { canvas: mirror, ctx: mirrorPen, w: W, h: H };
}

function bakedLayer(w: number, h: number) {
  if (typeof document === "undefined") return null;
  baked ??= document.createElement("canvas");
  bakedPen ??= baked.getContext("2d");
  if (!bakedPen) return null;
  const W = Math.max(2, Math.round(w));
  const H = Math.max(2, Math.round(h));
  if (baked.width !== W || baked.height !== H) {
    baked.width = W;
    baked.height = H;
    bakedKey = "";
  }
  return { canvas: baked, ctx: bakedPen, w: W, h: H };
}

export function releaseWater() {
  shifted = null;
  bakedKey = "";
  if (mirror) {
    mirror.width = 1;
    mirror.height = 1;
  }
  if (baked) {
    baked.width = 1;
    baked.height = 1;
  }
}

export function waterSway(time: number, kick: number) {
  return {
    x: Math.sin(time * 1.18) * (2.6 + kick * 5.5) + Math.sin(time * 0.41) * 1.2,
    y: Math.cos(time * 0.92) * (1.15 + kick * 2.4),
  };
}

/**
 * Cut walks the lake one scanline at a time. Here the scene is flipped
 * in one piece first, then each row is slid sideways by a slow swell so
 * the mirrored title stays a word, just wavy, the way the night template
 * reads on the water.
 */
export function drawWaterReflection(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number,
  kick: number,
  revision = "",
) {
  if (h < 4 || w < 4 || !src.width || !src.height) return;
  const faceOut = bakedLayer(w, h);
  if (!faceOut) return;
  const quant = Math.floor(Math.abs(time) * 15);
  const key = `${faceOut.w}x${faceOut.h}@${quant}|${revision}`;
  if (bakedKey === key) {
    ctx.drawImage(faceOut.canvas, x, y);
    return;
  }

  const dw = Math.max(2, Math.round(w / 2));
  const dh = Math.max(2, Math.round(h / 2));
  const face = mirrorLayer(dw, dh);
  if (!face) return;
  const { canvas, ctx: m, w: mw, h: mh } = face;
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.clearRect(0, 0, mw, mh);
  m.imageSmoothingEnabled = true;
  m.save();
  m.translate(0, mh);
  m.scale(mw / src.width, -(mh / src.height));
  m.drawImage(src, 0, 0);
  m.restore();

  const snap = m.getImageData(0, 0, mw, mh);
  if (!shifted || shifted.width !== mw || shifted.height !== mh) shifted = m.createImageData(mw, mh);
  const from = snap.data;
  const to = shifted.data;
  const sway = waterSway(time, kick);
  const scale = Math.max(0.7, Math.min(1.15, w / 1000));
  const rowScale = h / mh;
  const pixelScale = mw / w;

  for (let row = 0; row < mh; row++) {
    const t = row / Math.max(1, mh - 1);
    const travel = Math.sin(time * 1.25 - row * 0.018 * rowScale);
    const swell = Math.sin(time * 0.62 + row * 0.007 * rowScale);
    const amp = (7 + kick * 8) * scale * (0.2 + t * 0.85) * pixelScale;
    const ox = Math.round(travel * amp * 0.55 + swell * amp * 0.35 + sway.x * scale * t * 0.2 * pixelScale);
    const shade = 0.94 - t * 0.22;
    const base = row * mw * 4;
    for (let col = 0; col < mw; col++) {
      const sample = Math.max(0, Math.min(mw - 1, col - ox));
      const si = base + sample * 4;
      const di = base + col * 4;
      to[di] = from[si]! * shade;
      to[di + 1] = from[si + 1]! * shade;
      to[di + 2] = from[si + 2]! * shade;
      to[di + 3] = 255;
    }
  }
  m.putImageData(shifted, 0, 0);

  const out = faceOut.ctx;
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.imageSmoothingEnabled = true;
  out.fillStyle = "#05070c";
  out.fillRect(0, 0, faceOut.w, faceOut.h);
  out.drawImage(canvas, 0, 0, faceOut.w, faceOut.h);
  const tint = out.createLinearGradient(0, 0, 0, faceOut.h);
  tint.addColorStop(0, "rgba(6, 10, 16, 0)");
  tint.addColorStop(0.75, "rgba(4, 8, 12, 0.05)");
  tint.addColorStop(1, "rgba(2, 4, 8, 0.35)");
  out.fillStyle = tint;
  out.fillRect(0, 0, faceOut.w, faceOut.h);
  bakedKey = key;
  ctx.drawImage(faceOut.canvas, x, y);
}
