import { padIndex, type LookId, type Song, type WeatherId } from "@/lib/playlist";
import { albumKey, frameImage, KEY_AVATAR, KEY_BG } from "@/lib/images";
import { drawWaterReflection, releaseWater } from "@/lib/water-reflect";

export type DrawInput = {
  songs: Song[];
  index: number;
  local: number;
  total: number;
  time: number;
  smooth: number;
  motion: number;
  look: LookId;
  weather: WeatherId;
  fx: number;
  bg: number;
  name: string;
  titleA: string;
  titleB: string;
  caption: string;
  artist: string;
  showArtist: boolean;
  showWave: boolean;
  wave: number[];
  glide: number;
};

const INK = "#f4f4f5";
const MUTED = "#a1a1aa";
const SAND = "#d4b483";

function hexAlpha(hex: string, alpha: number) {
  const raw = hex.replace("#", "");
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(200,204,212,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let next = text;
  while (next.length > 1 && ctx.measureText(`${next}…`).width > max) next = next.slice(0, -1);
  return `${next}…`;
}

function sourceSize(img: CanvasImageSource) {
  const box = img as { width?: number; height?: number };
  return { sw: box.width ?? 0, sh: box.height ?? 0 };
}

function paintPhoto(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const { sw, sh } = sourceSize(img);
  if (sw < 1 || sh < 1) return;
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

let blurredBg: HTMLCanvasElement | null = null;
let blurredFrom: CanvasImageSource | null = null;

function paintBlurredPhoto(ctx: CanvasRenderingContext2D, w: number, h: number, alpha = 1) {
  const img = frameImage(KEY_BG);
  if (!img) return false;
  const width = Math.round(w);
  const height = Math.round(h);
  if (!blurredBg || blurredFrom !== img || blurredBg.width !== width || blurredBg.height !== height) {
    blurredBg = document.createElement("canvas");
    blurredBg.width = width;
    blurredBg.height = height;
    blurredFrom = img;
    const pen = blurredBg.getContext("2d");
    if (!pen) return false;
    pen.filter = "blur(16px)";
    paintPhoto(pen, img, -width * 0.04, -height * 0.04, width * 1.08, height * 1.08);
    pen.filter = "none";
    pen.fillStyle = "rgba(0,0,0,0.42)";
    pen.fillRect(0, 0, width, height);
  }
  const fade = Math.max(0, Math.min(1, alpha));
  if (fade > 0.01) {
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.drawImage(blurredBg, 0, 0, w, h);
    ctx.restore();
  }
  return true;
}

function coverOf(song: Song | undefined) {
  return song ? frameImage(albumKey(song.id)) : null;
}

const coverTiles = new Map<string, { canvas: HTMLCanvasElement; photo: CanvasImageSource }>();

function albumTile(song: Song, size: number) {
  const photo = coverOf(song);
  if (!photo) return null;
  const px = Math.max(8, Math.round(size));
  const key = `${song.id}|${px}`;
  const hit = coverTiles.get(key);
  if (hit && hit.photo === photo) return hit.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const pen = canvas.getContext("2d");
  if (!pen) return null;
  paintPhoto(pen, photo, 0, 0, px, px);
  if (coverTiles.size > 64) coverTiles.clear();
  coverTiles.set(key, { canvas, photo });
  return canvas;
}

function font(weight: number, size: number, italic = false) {
  return `${italic ? "italic " : ""}${weight} ${Math.max(8, size)}px "Be Vietnam Pro", "DM Sans", sans-serif`;
}

function display(weight: number, size: number) {
  return `${weight} ${Math.max(8, size)}px "Manrope", "Be Vietnam Pro", sans-serif`;
}

const GRAIN_TILE = 192;
const grainTiles: HTMLCanvasElement[] = [];
const grainPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern[]>();

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bakeGrain() {
  if (grainTiles.length || typeof document === "undefined") return;
  for (let variant = 0; variant < 4; variant++) {
    const tile = document.createElement("canvas");
    tile.width = GRAIN_TILE;
    tile.height = GRAIN_TILE;
    const pen = tile.getContext("2d");
    if (!pen) continue;
    const image = pen.createImageData(GRAIN_TILE, GRAIN_TILE);
    const data = image.data;
    const rnd = mulberry32(900 + variant * 131);
    for (let i = 0; i < data.length; i += 4) {
      const n = rnd();
      const spark = n > 0.9;
      const pit = n < 0.1;
      const tone = spark ? 255 : pit ? 0 : 118 + Math.floor(rnd() * 24);
      data[i] = tone;
      data[i + 1] = tone;
      data[i + 2] = tone;
      data[i + 3] = spark ? 220 : pit ? 180 : 70;
    }
    pen.putImageData(image, 0, 0);
    grainTiles.push(tile);
  }
}

function grainPatternsOf(ctx: CanvasRenderingContext2D) {
  const cached = grainPatterns.get(ctx);
  if (cached) return cached;
  bakeGrain();
  const patterns = grainTiles
    .map((tile) => ctx.createPattern(tile, "repeat"))
    .filter((pattern): pattern is CanvasPattern => pattern !== null);
  grainPatterns.set(ctx, patterns);
  return patterns;
}

function unitRand(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function paintImpact(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, radius: number, squash: number) {
  if (age <= 0 || age >= 1) return;
  const fade = (1 - age) * (1 - age);
  ctx.beginPath();
  ctx.ellipse(x, y, radius * (0.18 + age), radius * squash * (0.18 + age), 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(236,242,246,${0.7 * fade})`;
  ctx.lineWidth = Math.max(0.7, radius * 0.05 * (1.15 - age * 0.6));
  ctx.stroke();
  if (age > 0.2) {
    const next = (age - 0.2) / 0.8;
    const fade2 = (1 - next) * (1 - next);
    ctx.beginPath();
    ctx.ellipse(x, y, radius * (0.1 + next * 0.62), radius * squash * (0.1 + next * 0.62), 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(214,224,232,${0.4 * fade2})`;
    ctx.lineWidth = Math.max(0.6, radius * 0.03);
    ctx.stroke();
  }
}

function paintRain(ctx: CanvasRenderingContext2D, w: number, h: number, motion: number) {
  const wind = 0.14 + Math.sin(motion * 0.22) * 0.05;
  const far = Math.min(120, Math.max(52, Math.round((w * h) / 22000)));
  const farPaths = [new Path2D(), new Path2D(), new Path2D()];
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(214,222,230,0.95)";
  ctx.lineWidth = Math.max(0.6, h * 0.0008);
  for (let i = 0; i < far; i++) {
    const len = h * (0.016 + unitRand(i + 4) * 0.03);
    const x = unitRand(i * 1.37) * (w + len) - len;
    const y = (unitRand(i * 2.91) * (h + len) + motion * h * (0.72 + unitRand(i + 6) * 0.35)) % (h + len);
    const path = farPaths[i % 3]!;
    path.moveTo(x, y);
    path.lineTo(x + len * wind, y + len);
  }
  const farAlpha = [0.14, 0.22, 0.3];
  for (let band = 0; band < 3; band++) {
    ctx.globalAlpha = farAlpha[band]!;
    ctx.stroke(farPaths[band]!);
  }
  const near = Math.min(36, Math.max(16, Math.round((w * h) / 64000)));
  for (let i = 0; i < near; i++) {
    const len = h * (0.05 + unitRand(i + 8) * 0.075);
    const x = unitRand(i * 4.17) * (w + 90) - 45;
    const speed = 1.05 + unitRand(i + 3) * 0.6;
    const y = (unitRand(i * 6.2) * (h + len) + motion * h * speed) % (h + len);
    const x2 = x + len * wind;
    const y2 = y + len;
    ctx.globalAlpha = 0.2 + unitRand(i + 2) * 0.2;
    ctx.strokeStyle = "rgba(214,222,230,0.9)";
    ctx.lineWidth = Math.max(0.7, h * 0.0009);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = Math.max(1.1, h * 0.0016);
    ctx.beginPath();
    ctx.moveTo(x + (x2 - x) * 0.62, y + (y2 - y) * 0.62);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.beginPath();
    ctx.ellipse(x2, y2, h * 0.0015, h * 0.0022, Math.atan2(1, wind), 0, Math.PI * 2);
    ctx.fill();
    const travel = h + len;
    const head = (unitRand(i * 6.2) * travel + motion * h * speed) % travel;
    for (let band = 0; band < 2; band++) {
      const land = h * (0.56 + band * 0.2 + unitRand(i + 12 + band) * 0.1);
      const past = head - land;
      const span = h * 0.2;
      if (past > 0 && past < span) {
        paintImpact(ctx, x + len * wind, land, past / span, h * (0.028 + unitRand(i + band) * 0.02), 0.32);
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(176,188,200,0.045)";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function glassBead(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.ellipse(x + r * 0.08, y + r * 0.12, r * 0.94, r, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(4,8,12,0.38)";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.86, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(214,224,232,0.3)";
  ctx.fill();
  ctx.lineWidth = Math.max(0.7, r * 0.09);
  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x - r * 0.26, y - r * 0.32, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.22, y + r * 0.2, Math.max(0.45, r * 0.07), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fill();
}

function glassTear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.6);
  ctx.bezierCurveTo(x + r * 0.18, y - r * 0.3, x + r * 0.92, y + r * 0.15, x, y + r);
  ctx.bezierCurveTo(x - r * 0.92, y + r * 0.15, x - r * 0.18, y - r * 0.3, x, y - r * 1.6);
  ctx.closePath();
  ctx.fillStyle = "rgba(210,222,230,0.34)";
  ctx.fill();
  ctx.lineWidth = Math.max(0.7, r * 0.08);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x - r * 0.16, y - r * 0.62, r * 0.16, r * 0.07, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();
}

let beadPlate: HTMLCanvasElement | null = null;
let beadKey = "";

function beadStill(w: number, h: number) {
  const width = Math.max(2, Math.round(w));
  const height = Math.max(2, Math.round(h));
  const key = `${width}x${height}`;
  if (beadPlate && beadKey === key) return beadPlate;
  if (typeof document === "undefined") return null;
  beadPlate = document.createElement("canvas");
  beadPlate.width = width;
  beadPlate.height = height;
  const pen = beadPlate.getContext("2d");
  if (!pen) return null;
  const sitting = Math.min(38, Math.max(20, Math.round((width * height) / 64000)));
  for (let i = 0; i < sitting; i++) {
    const r = height * (0.0038 + Math.pow(unitRand(i + 6), 1.6) * 0.014);
    glassBead(pen, unitRand(i * 2.13) * width, unitRand(i * 5.07) * height, r);
  }
  beadKey = key;
  return beadPlate;
}

function paintDrops(ctx: CanvasRenderingContext2D, w: number, h: number, motion: number) {
  const still = beadStill(w, h);
  ctx.save();
  if (still) ctx.drawImage(still, 0, 0);
  const runs = Math.min(8, Math.max(5, Math.round(w / 280)));
  for (let i = 0; i < runs; i++) {
    const r = h * (0.007 + unitRand(i + 2) * 0.009);
    const x = unitRand(i * 8.2 + 1.7) * w;
    const span = h * (0.07 + unitRand(i + 4) * 0.14);
    const speed = 0.04 + unitRand(i) * 0.035;
    const y = (unitRand(i * 3.3) * (h + span) + motion * h * speed) % (h + span);
    ctx.strokeStyle = "rgba(220,230,236,0.38)";
    ctx.lineWidth = Math.max(1, r * 0.32);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(i) * r * 0.2, y - span);
    ctx.quadraticCurveTo(x + r * 0.8, y - span * 0.42, x, y - r * 0.2);
    ctx.stroke();
    glassTear(ctx, x, y, r);
    const travel = h + span;
    const pos = (unitRand(i * 3.3) * travel + motion * h * speed) % travel;
    const land = h * (0.5 + unitRand(i + 8) * 0.4);
    const past = pos - land;
    const hit = h * 0.16;
    if (past > 0 && past < hit) paintImpact(ctx, x, land, past / hit, h * 0.03, 1);
  }
  for (let i = 0; i < 3; i++) {
    const x0 = w * (0.12 + unitRand(i * 11.4) * 0.76);
    ctx.lineWidth = Math.max(1.1, h * 0.0018);
    ctx.strokeStyle = "rgba(214,224,232,0.22)";
    ctx.beginPath();
    const steps = 22;
    for (let step = 0; step <= steps; step++) {
      const y = (step / steps) * h;
      const x = x0 + Math.sin(y * 0.011 + motion * 0.55 + i * 2.1) * h * 0.011;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let bead = 0; bead < 5; bead++) {
      const t = (unitRand(i * 9 + bead * 1.7) + motion * (0.03 + i * 0.008)) % 1;
      const y = t * h;
      const x = x0 + Math.sin(y * 0.011 + motion * 0.55 + i * 2.1) * h * 0.011;
      glassBead(ctx, x, y, h * (0.0032 + unitRand(bead + i * 3) * 0.0036));
    }
  }
  ctx.restore();
}

function paintFlake(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = "rgba(255,255,255,0.94)";
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(0.7, r * 0.11);
  for (let arm = 0; arm < 6; arm++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r);
    ctx.moveTo(0, -r * 0.52);
    ctx.lineTo(r * 0.2, -r * 0.72);
    ctx.moveTo(0, -r * 0.52);
    ctx.lineTo(-r * 0.2, -r * 0.72);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0.6, r * 0.12), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintSnow(ctx: CanvasRenderingContext2D, w: number, h: number, motion: number) {
  const far = Math.min(80, Math.max(36, Math.round((w * h) / 28000)));
  const gust = Math.sin(motion * 0.28) * w * 0.035;
  ctx.save();
  ctx.fillStyle = "#f4f7fa";
  const soft = new Path2D();
  const firm = new Path2D();
  for (let i = 0; i < far; i++) {
    const depth = 0.25 + unitRand(i + 5) * 0.45;
    const sway = Math.sin(motion * (0.45 + depth) + i * 1.3) * w * 0.012;
    const x = (unitRand(i * 4.2) * w + gust * depth + sway + w) % w;
    const y = (unitRand(i * 8.4) * h + motion * h * (0.018 + depth * 0.03)) % h;
    const r = h * (0.0016 + depth * 0.0028);
    const path = i % 2 === 0 ? soft : firm;
    path.moveTo(x + r * 2.2, y);
    path.arc(x, y, r * 2.2, 0, Math.PI * 2);
    path.moveTo(x + r, y);
    path.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.globalAlpha = 0.16;
  ctx.fill(soft);
  ctx.globalAlpha = 0.34;
  ctx.fill(firm);
  const near = Math.min(16, Math.max(8, Math.round(w / 160)));
  for (let i = 0; i < near; i++) {
    const r = h * (0.007 + unitRand(i + 2) * 0.008);
    const sway = Math.sin(motion * 0.7 + i * 2) * w * 0.02;
    const x = (unitRand(i * 6.6) * w + gust + sway + w) % w;
    const y = (unitRand(i * 3.4) * h + motion * h * (0.045 + unitRand(i) * 0.03)) % h;
    ctx.globalAlpha = 0.14;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.82 + unitRand(i + 4) * 0.18;
    paintFlake(ctx, x, y, r, motion * (0.35 + unitRand(i) * 0.4) + i);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(236,240,244,0.045)";
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  ctx.restore();
}

let fxCanvas: HTMLCanvasElement | null = null;

function paintWeather(ctx: CanvasRenderingContext2D, w: number, h: number, motion: number, weather: WeatherId, amount: number) {
  if (weather === "none" || amount <= 0.004 || typeof document === "undefined") return;
  if (!fxCanvas) fxCanvas = document.createElement("canvas");
  const width = Math.max(2, Math.round(w / 2));
  const height = Math.max(2, Math.round(h / 2));
  if (fxCanvas.width !== width || fxCanvas.height !== height) {
    fxCanvas.width = width;
    fxCanvas.height = height;
  }
  const pen = fxCanvas.getContext("2d");
  if (!pen) return;
  pen.setTransform(1, 0, 0, 1, 0, 0);
  pen.clearRect(0, 0, width, height);
  if (weather === "rain") paintRain(pen, width, height, motion);
  else if (weather === "drops") paintDrops(pen, width, height, motion);
  else if (weather === "snow") paintSnow(pen, width, height, motion);
  else if (weather === "grain") paintGrain(pen, width, height, motion);
  ctx.save();
  ctx.globalAlpha = Math.min(1, amount);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fxCanvas, 0, 0, w, h);
  ctx.restore();
}

let glowSprite: HTMLCanvasElement | null = null;
let glowKey = "";

function grainGlow(radius: number) {
  const size = Math.max(8, Math.ceil(radius * 2));
  const key = `${size}`;
  if (glowSprite && glowKey === key) return glowSprite;
  if (typeof document === "undefined") return null;
  glowSprite = document.createElement("canvas");
  glowSprite.width = size;
  glowSprite.height = size;
  const pen = glowSprite.getContext("2d");
  if (!pen) return null;
  const glow = pen.createRadialGradient(size / 2, size / 2, radius * 0.04, size / 2, size / 2, radius);
  glow.addColorStop(0, "#ffffff");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  pen.fillStyle = glow;
  pen.fillRect(0, 0, size, size);
  glowKey = key;
  return glowSprite;
}

function paintGrain(ctx: CanvasRenderingContext2D, w: number, h: number, motion: number) {
  const patterns = grainPatternsOf(ctx);
  if (!patterns.length || w < 2 || h < 2) return;
  const frame = Math.floor(Math.abs(motion) * 30);
  const fine = patterns[frame % patterns.length];
  const coarse = patterns[(frame + 2) % patterns.length];
  if (!fine || !coarse) return;

  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = 0.2;
  ctx.translate((frame * 13) % GRAIN_TILE, (frame * 29) % GRAIN_TILE);
  ctx.fillStyle = fine;
  ctx.fillRect(-GRAIN_TILE, -GRAIN_TILE, w + GRAIN_TILE * 2, h + GRAIN_TILE * 2);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = 0.14;
  ctx.translate((frame * 7) % GRAIN_TILE, (frame * 19) % GRAIN_TILE);
  ctx.scale(2.15, 2.15);
  ctx.fillStyle = coarse;
  ctx.fillRect(-GRAIN_TILE * 2, -GRAIN_TILE * 2, (w + GRAIN_TILE * 6) / 2.15, (h + GRAIN_TILE * 6) / 2.15);
  ctx.restore();

  const unit = Math.max(1, Math.min(w, h) / 1080);
  ctx.save();
  ctx.fillStyle = "#f4f4f5";
  for (let i = 0; i < 16; i++) {
    const life = unitRand(i * 9.2 + frame * 0.37);
    if (life < 0.62) continue;
    const x = unitRand(i * 3.7 + Math.floor(motion * 0.35)) * w;
    const y = (unitRand(i * 8.1) * h + motion * (10 + (i % 4) * 4) * unit) % h;
    const size = (1.1 + unitRand(i + 2.2) * 1.6) * unit;
    ctx.globalAlpha = (life - 0.62) * 0.55;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();

  const sx = w * (0.5 + 0.26 * Math.sin(motion * 0.17));
  const sy = h * (0.42 + 0.16 * Math.cos(motion * 0.13));
  const radius = Math.max(w, h) * 0.62;
  const lift = 0.03 + 0.012 * Math.sin(motion * 0.85);
  const sprite = grainGlow(radius);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  if (sprite) {
    ctx.globalAlpha = lift;
    ctx.drawImage(sprite, sx - radius, sy - radius, radius * 2, radius * 2);
  }
  ctx.restore();
}


function waveOf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  wave: number[],
  motion: number,
  playing: boolean,
) {
  const n = 28;
  const gap = width * 0.012;
  const barW = (width - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const sample = wave[i] ?? 0;
    const idle = 0.08 + 0.06 * Math.sin(motion * 2 + i * 0.45);
    const amp = playing ? Math.max(0.08, sample) : idle;
    const bh = Math.max(2, amp * height);
    ctx.fillStyle = i % 5 === 0 ? SAND : "rgba(200,204,212,0.72)";
    roundRect(ctx, x + i * (barW + gap), y + height - bh, barW, bh, barW / 2);
    ctx.fill();
  }
}


const LIME = "#e2f04a";

function titleLines(input: DrawInput) {
  return {
    lead: input.titleA.trim().toUpperCase(),
    rest: input.titleB.trim().toUpperCase(),
    caption: input.caption.trim(),
  };
}

function credit(input: DrawInput) {
  return input.showArtist ? input.artist.trim() : "";
}

function joinedTitle(input: DrawInput) {
  return [input.titleA.trim(), input.titleB.trim()].filter(Boolean).join(" ");
}

function paintSleeve(
  ctx: CanvasRenderingContext2D,
  song: Song,
  index: number,
  x: number,
  y: number,
  size: number,
  rot: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = size * 0.2;
  ctx.shadowOffsetY = size * 0.07;
  roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.09);
  ctx.fillStyle = "#101114";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.clip();

  const tile = albumTile(song, size);
  if (tile) {
    ctx.drawImage(tile, -size / 2, -size / 2, size, size);
    ctx.restore();
    return;
  }

  const g = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
  g.addColorStop(0, "#1a1c22");
  g.addColorStop(1, "#0c0d11");
  ctx.fillStyle = g;
  ctx.fillRect(-size / 2, -size / 2, size, size);

  const tone = Math.abs(song.tone) % 5;
  ctx.fillStyle = song.color;
  if (tone === 0) {
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(size * 0.02, -size * 0.02, size * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(size * 0.02, -size * 0.02, size * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = "#0c0d11";
    ctx.fill();
  } else if (tone === 1) {
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-size / 2, -size * 0.08, size, size * 0.16);
    ctx.globalAlpha = 0.45;
    ctx.fillRect(-size / 2, size * 0.18, size, size * 0.05);
  } else if (tone === 2) {
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(-size * 0.28 + i * size * 0.16, size * 0.05, size * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.55;
    ctx.fillRect(size * 0.12, -size / 2, size * 0.22, size);
  } else if (tone === 3) {
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(-size / 2, size / 2);
    ctx.lineTo(size * 0.1, -size / 2);
    ctx.lineTo(size / 2, -size / 2);
    ctx.lineTo(size / 2, size / 2);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = size * 0.035;
    ctx.strokeStyle = song.color;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(-size * 0.05, size * 0.02, size * 0.1 * i, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#f4f4f5";
  ctx.font = font(700, size * 0.42);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(padIndex(index), -size * 0.36, size * 0.08);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = Math.max(1, size * 0.012);
  roundRect(ctx, -size / 2 + 1.5, -size / 2 + 1.5, size - 3, size - 3, size * 0.09);
  ctx.stroke();
  ctx.restore();
}

const sleevePlates = new Map<string, { canvas: HTMLCanvasElement; photo: CanvasImageSource | null }>();
const posterBlobSlot = { canvas: null as HTMLCanvasElement | null, pen: null as CanvasRenderingContext2D | null };
const posterShadeSlot = { canvas: null as HTMLCanvasElement | null, pen: null as CanvasRenderingContext2D | null };
const posterChromeSlot = { canvas: null as HTMLCanvasElement | null, pen: null as CanvasRenderingContext2D | null };
let posterBlobKey = "";
let posterShadeKey = "";
let posterChromeKey = "";

function sleeveBitmap(song: Song, index: number, size: number) {
  const photo = coverOf(song);
  const key = `${song.id}|${index}|${Math.round(size)}|${song.color}|${song.tone}`;
  const hit = sleevePlates.get(key);
  if (hit && hit.photo === photo) return hit.canvas;
  const pad = Math.ceil(size * 0.55);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.ceil(size + pad * 2));
  canvas.height = canvas.width;
  const pen = canvas.getContext("2d");
  if (!pen) return canvas;
  paintSleeve(pen, song, index, canvas.width / 2, canvas.height / 2, size, 0);
  if (sleevePlates.size > 36) sleevePlates.clear();
  sleevePlates.set(key, { canvas, photo });
  return canvas;
}

function paintPosterBlobs(ctx: CanvasRenderingContext2D, w: number, h: number, motion: number, color: string) {
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, w, h);
  const blobs: Array<[number, number, number, string]> = [
    [0.18, 0.42, 0.42, color],
    [0.48, 0.22, 0.28, "#1a2438"],
    [0.08, 0.82, 0.26, "#2a2218"],
    [0.62, 0.78, 0.34, "#142028"],
  ];
  blobs.forEach(([bx, by, br, ink], i) => {
    const ox = Math.sin(motion * 0.18 + i) * w * 0.02;
    const oy = Math.cos(motion * 0.14 + i * 1.3) * h * 0.015;
    const cx = bx * w + ox;
    const cy = by * h + oy;
    const rad = Math.max(w, h) * br;
    const glow = ctx.createRadialGradient(cx, cy, rad * 0.05, cx, cy, rad);
    glow.addColorStop(0, hexAlpha(ink, 0.5));
    glow.addColorStop(1, "rgba(7,8,12,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  });
}

function posterBlobPlate(w: number, h: number, motion: number, color: string) {
  const plate = sizedPlate(posterBlobSlot, Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
  if (!plate) return null;
  const key = `${plate.w}x${plate.h}@${Math.floor(Math.abs(motion) * 15)}|${color}`;
  if (posterBlobKey !== key) {
    plate.ctx.setTransform(1, 0, 0, 1, 0, 0);
    paintPosterBlobs(plate.ctx, plate.w, plate.h, motion, color);
    posterBlobKey = key;
  }
  return plate.canvas;
}

function posterShadePlate(w: number, h: number) {
  const plate = sizedPlate(posterShadeSlot, w, h);
  if (!plate) return null;
  const key = `${plate.w}x${plate.h}`;
  if (posterShadeKey !== key) {
    plate.ctx.setTransform(1, 0, 0, 1, 0, 0);
    plate.ctx.clearRect(0, 0, plate.w, plate.h);
    const shade = plate.ctx.createLinearGradient(plate.w * 0.32, 0, plate.w, 0);
    shade.addColorStop(0, "rgba(7,8,12,0)");
    shade.addColorStop(0.45, "rgba(7,8,12,0.28)");
    shade.addColorStop(1, "rgba(7,8,12,0.55)");
    plate.ctx.fillStyle = shade;
    plate.ctx.fillRect(0, 0, plate.w, plate.h);
    posterShadeKey = key;
  }
  return plate.canvas;
}

function posterFrame(w: number, h: number, input: DrawInput) {
  const wide = w > h * 1.15;
  const titleX = wide ? w * 0.5 : w * 0.07;
  const titleY = wide ? h * 0.32 : h * 0.46;
  const { caption } = titleLines(input);
  const creditName = credit(input);
  let after = titleY + h * (wide ? 0.05 : 0.055);
  const creditY = creditName ? after : 0;
  if (creditName) after += h * 0.032;
  const captionY = caption ? after : 0;
  if (caption) after += h * 0.03;
  const listTop = after + h * (wide ? 0.026 : 0.02);
  return { wide, titleX, titleY, creditY, captionY, listTop, creditName, caption };
}

function paintPosterChrome(ctx: CanvasRenderingContext2D, w: number, h: number, input: DrawInput) {
  const { lead, rest } = titleLines(input);
  const { wide, titleX, titleY, creditY, captionY, creditName, caption } = posterFrame(w, h, input);
  const titleSize = h * (wide ? 0.059 : 0.055);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let leadW = 0;
  if (lead) {
    ctx.fillStyle = LIME;
    ctx.font = display(600, titleSize);
    ctx.letterSpacing = "0.03em";
    ctx.fillText(lead, titleX, titleY);
    leadW = ctx.measureText(lead).width;
  }
  if (rest) {
    ctx.fillStyle = "#f7f7f8";
    ctx.font = display(500, titleSize);
    ctx.letterSpacing = "0.03em";
    ctx.fillText(ellipsis(ctx, rest, w - titleX - leadW - w * 0.08), titleX + (lead ? leadW + w * 0.016 : 0), titleY);
  }
  ctx.letterSpacing = "0px";
  if (lead || rest) {
    const markW = lead ? Math.max(leadW * 0.72, w * 0.08) : w * 0.12;
    ctx.strokeStyle = "rgba(244,244,245,0.9)";
    ctx.lineWidth = Math.max(1, h * 0.003);
    ctx.beginPath();
    ctx.moveTo(titleX, titleY + h * 0.018);
    ctx.lineTo(titleX + markW, titleY + h * 0.018);
    ctx.stroke();
  }
  if (creditName) {
    ctx.fillStyle = "rgba(244,244,245,0.82)";
    ctx.font = font(500, h * (wide ? 0.018 : 0.016));
    ctx.fillText(ellipsis(ctx, creditName, w * 0.4), titleX, creditY);
  }
  if (caption) {
    ctx.fillStyle = "rgba(226,226,230,0.72)";
    ctx.font = font(400, h * (wide ? 0.016 : 0.02));
    ctx.fillText(ellipsis(ctx, caption, w * (wide ? 0.42 : 0.8)), titleX, captionY);
  }
}

function posterChromePlate(w: number, h: number, input: DrawInput) {
  const plate = sizedPlate(posterChromeSlot, w, h);
  if (!plate) return null;
  const { lead, rest, caption } = titleLines(input);
  const key = [plate.w, plate.h, lead, rest, caption, credit(input)].join("|");
  if (posterChromeKey !== key) {
    plate.ctx.setTransform(1, 0, 0, 1, 0, 0);
    plate.ctx.clearRect(0, 0, plate.w, plate.h);
    paintPosterChrome(plate.ctx, plate.w, plate.h, input);
    posterChromeKey = key;
  }
  return plate.canvas;
}

function drawPoster(ctx: CanvasRenderingContext2D, input: DrawInput) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const song = input.songs[input.index];
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, w, h);
  const hasPhoto = paintBlurredPhoto(ctx, w, h, input.bg);
  if (!hasPhoto) {
    const blobs = posterBlobPlate(w, h, input.motion, song?.color ?? "#243044");
    if (blobs) ctx.drawImage(blobs, 0, 0, w, h);
  }
  const shade = posterShadePlate(w, h);
  if (shade) ctx.drawImage(shade, 0, 0);

  if (!input.songs.length) {
    empty(ctx, w, h);
    return;
  }

  const wide = w > h * 1.15;
  const slots = wide
    ? [
        { x: -0.02, y: 0.2, s: 0.22, r: -0.38 },
        { x: 0.2, y: 0.14, s: 0.34, r: 0.16 },
        { x: 0.04, y: 0.52, s: 0.18, r: -0.22 },
        { x: 0.26, y: 0.62, s: 0.32, r: 0.3 },
        { x: -0.04, y: 0.86, s: 0.16, r: 0.55 },
      ]
    : [
        { x: 0.18, y: 0.18, s: 0.3, r: -0.32 },
        { x: 0.62, y: 0.14, s: 0.36, r: 0.18 },
        { x: 0.4, y: 0.3, s: 0.2, r: 0.5 },
      ];
  slots.forEach((slot, i) => {
    const pick = input.songs[i % input.songs.length];
    if (!pick) return;
    const bob = Math.sin(input.motion * 0.35 + i * 1.4) * h * 0.008;
    const spin = input.motion * (i % 2 === 0 ? 0.08 : -0.06);
    const size = (wide ? h : w) * slot.s;
    const plate = sleeveBitmap(pick, i, size);
    ctx.save();
    ctx.translate(slot.x * w, slot.y * h + bob);
    ctx.rotate(slot.r + spin);
    ctx.drawImage(plate, -plate.width / 2, -plate.height / 2);
    ctx.restore();
  });

  const chrome = posterChromePlate(w, h, input);
  if (chrome) ctx.drawImage(chrome, 0, 0);

  const frame = posterFrame(w, h, input);
  const { titleX, listTop } = frame;
  const cols = wide ? 2 : 1;
  const maxRows = wide ? 6 : 8;
  const page = maxRows * cols;
  const start = Math.floor(input.index / page) * page;
  const visible = input.songs.slice(start, start + page);
  const perCol = cols === 2 ? Math.ceil(visible.length / 2) : visible.length;
  const rowH = h * (wide ? 0.034 : 0.058);
  const gutter = wide ? w * 0.03 : 0;
  const colW = wide ? w * 0.19 : w * 0.86;
  const colX = [titleX, titleX + colW + gutter];
  const songSize = wide ? h * 0.0204 : rowH * 0.3;
  ctx.font = font(700, songSize);
  const numCol = ctx.measureText("00.").width + songSize * 0.45;

  visible.forEach((item, offset) => {
    const col = cols === 2 && offset >= perCol ? 1 : 0;
    const row = cols === 2 && offset >= perCol ? offset - perCol : offset;
    const index = start + offset;
    const x = colX[col] ?? titleX;
    const y = listTop + row * rowH;
    const active = index === input.index;
    const num = `${padIndex(index)}.`;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = active ? LIME : "rgba(228,228,232,0.78)";
    ctx.font = font(500, songSize);
    ctx.fillText(num, x, y);
    ctx.fillStyle = active ? "#ffffff" : "rgba(244,244,245,0.92)";
    ctx.font = font(active ? 600 : 500, songSize);
    const title = ellipsis(ctx, item.title, colW - numCol);
    ctx.fillText(title, x + numCol, y);
    if (active) {
      const tw = Math.max(8, ctx.measureText(title).width);
      const p = item.duration > 0 ? input.local / item.duration : 0;
      const barY = y + songSize * 0.28;
      const barH = Math.max(1.5, h * 0.0035);
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(x + numCol, barY, tw, barH);
      ctx.fillStyle = LIME;
      ctx.fillRect(x + numCol, barY, tw * Math.max(0, Math.min(1, p)), barH);
    }
  });

  if (wide && song) {
    const barLeft = titleX;
    const barRight = (colX[1] ?? titleX) + colW;
    const played = song.duration > 0 ? input.local / song.duration : 0;
    paintTransport(ctx, barLeft, barRight, listTop + perCol * rowH + h * 0.03, h, played);
  }

  if (input.showWave) {
    const samples = input.wave.some((value) => value > 0.04)
      ? input.wave
      : Array.from({ length: 28 }, (_, i) => 0.22 + 0.18 * Math.sin(input.motion * 1.6 + i * 0.45));
    waveOf(ctx, titleX, h * (wide ? 0.9 : 0.93), w * (wide ? 0.22 : 0.56), h * 0.045, samples, input.motion, true);
  }

}

const YELLOW = "#ffe14a";

let dryBuf: HTMLCanvasElement | null = null;
const backSlot = { canvas: null as HTMLCanvasElement | null, pen: null as CanvasRenderingContext2D | null };
const frontSlot = { canvas: null as HTMLCanvasElement | null, pen: null as CanvasRenderingContext2D | null };
const typeSlot = { canvas: null as HTMLCanvasElement | null, pen: null as CanvasRenderingContext2D | null };
let nightBackKey = "";
let nightBackPhoto: CanvasImageSource | null = null;
let nightFrontKey = "";
let nightTypeKey = "";

function dryCanvas(w: number, h: number) {
  if (typeof document === "undefined") return null;
  dryBuf ??= document.createElement("canvas");
  const W = Math.max(2, Math.round(w));
  const H = Math.max(2, Math.round(h));
  if (dryBuf.width !== W || dryBuf.height !== H) {
    dryBuf.width = W;
    dryBuf.height = H;
  }
  return dryBuf;
}

function sizedPlate(
  slot: { canvas: HTMLCanvasElement | null; pen: CanvasRenderingContext2D | null },
  w: number,
  h: number,
) {
  if (typeof document === "undefined") return null;
  slot.canvas ??= document.createElement("canvas");
  slot.pen ??= slot.canvas.getContext("2d");
  if (!slot.pen) return null;
  const W = Math.max(2, Math.round(w));
  const H = Math.max(2, Math.round(h));
  if (slot.canvas.width !== W || slot.canvas.height !== H) {
    slot.canvas.width = W;
    slot.canvas.height = H;
  }
  return { canvas: slot.canvas, ctx: slot.pen, w: W, h: H };
}

function paintNightBack(ctx: CanvasRenderingContext2D, w: number, h: number, fade: number) {
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, w, h);
  const panel = w * (h > w ? 0.42 : 0.44);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, panel, h);
  ctx.clip();
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#1a2030");
  sky.addColorStop(0.35, "#10151f");
  sky.addColorStop(1, "#07090e");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, panel, h);
  ctx.fillStyle = "#07090e";
  const roofs = [0.0, 0.12, 0.24, 0.37, 0.5, 0.63, 0.76, 0.9];
  roofs.forEach((bx, i) => {
    const bh = h * (0.22 + ((i * 17) % 9) * 0.035);
    ctx.fillRect(bx * panel, h * 0.62 - bh * 0.15, panel * 0.13, h);
  });
  const photo = frameImage(KEY_BG);
  const shown = Math.max(0, Math.min(1, fade));
  if (photo && shown > 0.01) {
    ctx.save();
    ctx.globalAlpha = shown;
    paintPhoto(ctx, photo, 0, 0, panel, h);
    ctx.restore();
    ctx.fillStyle = `rgba(0,0,0,${0.28 * shown})`;
    ctx.fillRect(0, 0, panel, h);
  }
  ctx.restore();
}

function paintNightMotion(ctx: CanvasRenderingContext2D, w: number, h: number, motion: number) {
  const panel = w * (h > w ? 0.42 : 0.44);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, panel, h);
  ctx.clip();
  if (!frameImage(KEY_BG)) {
    const lamps = [
      [0.16, 0.38, 0.045, "rgba(255, 236, 196, 0.9)"],
      [0.28, 0.3, 0.03, "rgba(255, 214, 120, 0.7)"],
      [0.4, 0.46, 0.038, "rgba(220, 230, 245, 0.55)"],
      [0.22, 0.58, 0.022, "rgba(255, 244, 220, 0.65)"],
      [0.52, 0.34, 0.026, "rgba(255, 196, 140, 0.55)"],
      [0.62, 0.5, 0.02, "rgba(255, 255, 255, 0.4)"],
      [0.08, 0.48, 0.018, "rgba(180, 200, 230, 0.45)"],
      [0.72, 0.42, 0.024, "rgba(255, 220, 150, 0.5)"],
    ] as const;
    for (const [lx, ly, lr, color] of lamps) {
      const bob = Math.sin(motion * 0.7 + lx * 9) * h * 0.008;
      const g = ctx.createRadialGradient(lx * panel, ly * h + bob, 1, lx * panel, ly * h + bob, lr * panel);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx * panel, ly * h + bob, lr * panel, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(1, h * 0.0035);
  for (let i = 0; i < 22; i++) {
    const x = ((i * 47 + motion * 18) % Math.max(8, panel));
    const len = h * (0.06 + (i % 5) * 0.012);
    const y0 = ((motion * 36 + i * 53) % (h + len)) - len;
    ctx.globalAlpha = 0.25 + (i % 4) * 0.08;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x - h * 0.012, y0 + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function paintNightFront(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const panel = w * (h > w ? 0.42 : 0.44);
  ctx.strokeStyle = "rgba(232, 236, 242, 0.22)";
  ctx.lineWidth = Math.max(2, h * 0.014);
  const frameX = h * 0.018;
  const frameY = h * 0.028;
  const frameW = panel - h * 0.04;
  const frameH = h - h * 0.056;
  ctx.strokeRect(frameX, frameY, frameW, frameH);
  ctx.lineWidth = Math.max(1, h * 0.004);
  ctx.beginPath();
  ctx.moveTo(frameX + frameW * 0.5, frameY);
  ctx.lineTo(frameX + frameW * 0.5, frameY + frameH);
  ctx.moveTo(frameX, frameY + frameH * 0.46);
  ctx.lineTo(frameX + frameW, frameY + frameH * 0.46);
  ctx.stroke();
  const spill = ctx.createRadialGradient(panel * 0.7, h * 0.45, 8, panel * 0.55, h * 0.5, panel * 0.7);
  spill.addColorStop(0, "rgba(170, 186, 210, 0.08)");
  spill.addColorStop(1, "rgba(7,8,12,0)");
  ctx.fillStyle = spill;
  ctx.fillRect(panel * 0.3, 0, panel, h);
  const shade = ctx.createLinearGradient(panel * 0.78, 0, panel * 1.02, 0);
  shade.addColorStop(0, "rgba(7,8,12,0)");
  shade.addColorStop(1, "#07080c");
  ctx.fillStyle = shade;
  ctx.fillRect(panel * 0.7, 0, panel * 0.4, h);
}

function nightBackPlate(w: number, h: number, fade: number) {
  const plate = sizedPlate(backSlot, w, h);
  if (!plate) return null;
  const photo = frameImage(KEY_BG);
  const key = `${plate.w}x${plate.h}|${Math.round(fade * 100)}`;
  if (nightBackKey !== key || nightBackPhoto !== photo) {
    plate.ctx.setTransform(1, 0, 0, 1, 0, 0);
    plate.ctx.clearRect(0, 0, plate.w, plate.h);
    paintNightBack(plate.ctx, plate.w, plate.h, fade);
    nightBackKey = key;
    nightBackPhoto = photo;
  }
  return plate.canvas;
}

function nightFrontPlate(w: number, h: number) {
  const plate = sizedPlate(frontSlot, w, h);
  if (!plate) return null;
  const key = `${plate.w}x${plate.h}`;
  if (nightFrontKey !== key) {
    plate.ctx.setTransform(1, 0, 0, 1, 0, 0);
    plate.ctx.clearRect(0, 0, plate.w, plate.h);
    paintNightFront(plate.ctx, plate.w, plate.h);
    nightFrontKey = key;
  }
  return plate.canvas;
}

function nightTextSpan(w: number, deck: { wide: boolean; x: number; right: number }) {
  const cols = deck.wide ? 2 : 1;
  const gutter = deck.wide ? w * 0.03 : 0;
  const colW = deck.wide ? w * 0.16 : deck.right - deck.x;
  const right = Math.min(deck.right, deck.x + colW * cols + gutter * Math.max(0, cols - 1));
  return { cols, gutter, colW, right };
}

function nightDeck(w: number, full: number, shore: number) {
  const wide = full <= w;
  const x = w * (wide ? 0.52 : 0.08);
  const right = w * (wide ? 0.94 : 0.92);
  const controlH = full * (wide ? 0.072 : 0.09);
  const controlTop = shore - controlH - full * 0.012;
  return { wide, x, right, controlH, controlTop };
}

function paintNightText(ctx: CanvasRenderingContext2D, w: number, full: number, shore: number, input: DrawInput) {
  const deck = nightDeck(w, full, shore);
  const span = nightTextSpan(w, deck);
  const { lead, rest, caption } = titleLines(input);
  const titleMax = span.right - deck.x;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  let y = shore * 0.22;
  ctx.letterSpacing = "0.03em";
  if (lead) {
    const size = fitFont(ctx, lead, 600, full * (deck.wide ? 0.05 : 0.038), titleMax, true);
    ctx.shadowColor = "rgba(255, 210, 40, 0.4)";
    ctx.shadowBlur = full * 0.008;
    ctx.fillStyle = YELLOW;
    ctx.font = display(600, size);
    ctx.letterSpacing = "0.03em";
    ctx.fillText(lead, deck.x, y);
    y += size * 1.16;
  }
  if (rest) {
    const size = fitFont(ctx, rest, 500, full * (deck.wide ? 0.058 : 0.044), titleMax, true);
    ctx.shadowColor = "rgba(255,255,255,0.28)";
    ctx.shadowBlur = full * 0.006;
    ctx.fillStyle = "#f7f7f8";
    ctx.font = display(500, size);
    ctx.letterSpacing = "0.03em";
    ctx.fillText(rest, deck.x, y);
    y += size * 1.12;
  }
  ctx.shadowBlur = 0;
  ctx.letterSpacing = "0px";
  const nightCredit = credit(input);
  if (nightCredit) {
    ctx.fillStyle = "rgba(244,244,245,0.72)";
    ctx.font = font(500, full * 0.0167);
    ctx.fillText(ellipsis(ctx, nightCredit, titleMax), deck.x, y);
    y += full * 0.026;
  }
  if (caption) {
    ctx.fillStyle = "rgba(244,244,245,0.72)";
    ctx.font = font(500, full * 0.0167);
    ctx.fillText(ellipsis(ctx, caption, titleMax), deck.x, y);
    y += full * 0.026;
  }

  const rows = deck.wide ? 6 : Math.min(8, Math.max(1, input.songs.length));
  const controlLine = deck.controlTop + full * 0.012;
  const listTop = y + full * 0.02;
  const listBottom = controlLine - full * 0.03;
  const room = Math.max(rows * 10, listBottom - listTop);
  const rowH = deck.wide ? Math.min(full * 0.032, room / rows) : Math.max(full * 0.024, room / rows);
  const songSize = Math.min(deck.wide ? full * 0.02 : full * 0.018, rowH * 0.62);
  const gutter = span.gutter;
  const colW = span.colW;
  const cols = span.cols;
  ctx.font = font(500, songSize);
  const numCol = ctx.measureText("00.").width + songSize * 0.45;
  input.songs.forEach((item, index) => {
    const col = cols === 2 && index >= rows ? 1 : 0;
    const row = cols === 2 && index >= rows ? index - rows : index;
    if (row < 0 || row >= rows || col > cols - 1) return;
    const active = index === input.index;
    const tx = deck.x + col * (colW + gutter);
    const ty = listTop + row * rowH + songSize;
    ctx.fillStyle = active ? YELLOW : "rgba(244,244,245,0.9)";
    ctx.font = font(active ? 600 : 500, songSize);
    ctx.fillText(`${padIndex(index)}.`, tx, ty);
    ctx.fillText(ellipsis(ctx, item.title, colW - numCol - w * 0.015), tx + numCol, ty);
  });
}

function paintSkip(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, dir: 1 | -1) {
  const triH = size * 0.32;
  const triW = size * 0.26;
  const back = cx - dir * size * 0.02;
  const tip = cx + dir * triW;
  ctx.beginPath();
  ctx.moveTo(tip, cy);
  ctx.lineTo(back, cy - triH);
  ctx.lineTo(back, cy + triH);
  ctx.closePath();
  ctx.stroke();
  const barX = dir > 0 ? tip + size * 0.28 : tip - size * 0.28;
  ctx.beginPath();
  ctx.moveTo(barX, cy - triH);
  ctx.lineTo(barX, cy + triH);
  ctx.stroke();
}

function paintHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size * 0.46;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.78);
  ctx.bezierCurveTo(cx - s * 1.2, cy + s * 0.1, cx - s * 0.72, cy - s * 0.95, cx, cy - s * 0.22);
  ctx.bezierCurveTo(cx + s * 0.72, cy - s * 0.95, cx + s * 1.2, cy + s * 0.1, cx, cy + s * 0.78);
  ctx.stroke();
}

function paintTransport(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  top: number,
  full: number,
  progress: number,
) {
  const span = Math.max(8, x1 - x0);
  const p = Math.max(0, Math.min(1, progress));
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#f7f7f8";
  ctx.fillStyle = "#f7f7f8";
  ctx.lineWidth = Math.max(1.15, full * 0.0015);
  ctx.beginPath();
  ctx.moveTo(x0, top);
  ctx.lineTo(x1, top);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x0 + span * p, top, Math.max(2.5, full * 0.0036), 0, Math.PI * 2);
  ctx.fill();

  const cy = top + full * 0.046;
  const size = full * 0.018;
  const spots = [0.1, 0.3, 0.5, 0.7, 0.9];
  ctx.lineWidth = Math.max(1.15, full * 0.00135);
  paintHeart(ctx, x0 + span * spots[0]!, cy, size);
  paintSkip(ctx, x0 + span * spots[1]!, cy, size, -1);
  const px = x0 + span * spots[2]!;
  const pauseR = size * 0.58;
  ctx.beginPath();
  ctx.arc(px, cy, pauseR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px - pauseR * 0.28, cy - pauseR * 0.36);
  ctx.lineTo(px - pauseR * 0.28, cy + pauseR * 0.36);
  ctx.moveTo(px + pauseR * 0.28, cy - pauseR * 0.36);
  ctx.lineTo(px + pauseR * 0.28, cy + pauseR * 0.36);
  ctx.stroke();
  paintSkip(ctx, x0 + span * spots[3]!, cy, size, 1);
  const mx = x0 + span * spots[4]!;
  ctx.beginPath();
  ctx.arc(mx, cy, size * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mx - size * 0.2, cy);
  ctx.lineTo(mx + size * 0.2, cy);
  ctx.stroke();
  ctx.restore();
}

function paintNightControls(ctx: CanvasRenderingContext2D, w: number, shore: number, full: number, input: DrawInput) {
  const song = input.songs[input.index];
  if (!song) return;
  const deck = nightDeck(w, full, shore);
  const span = nightTextSpan(w, deck);
  const progress = song.duration > 0 ? input.local / song.duration : 0;
  const top = deck.controlTop + full * 0.012;
  paintTransport(ctx, deck.x, span.right, top, full, progress);
}

function nightCaptionPlate(w: number, shore: number, full: number, input: DrawInput) {
  const plate = sizedPlate(typeSlot, w, shore);
  if (!plate) return null;
  const { lead, rest, caption } = titleLines(input);
  const key = [
    plate.w,
    plate.h,
    full,
    lead,
    rest,
    caption,
    credit(input),
    input.index,
    input.songs.map((song) => song.title).join("\n"),
  ].join("|");
  if (nightTypeKey !== key) {
    plate.ctx.setTransform(1, 0, 0, 1, 0, 0);
    plate.ctx.clearRect(0, 0, plate.w, plate.h);
    plate.ctx.shadowBlur = 0;
    paintNightText(plate.ctx, plate.w, full, shore, input);
    nightTypeKey = key;
  }
  return plate.canvas;
}

function drawNight(ctx: CanvasRenderingContext2D, input: DrawInput) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const shore = Math.round(h * (h > w ? 0.56 : 0.58));
  const dry = dryCanvas(w, shore);
  if (!dry) return;
  const pen = dry.getContext("2d", { alpha: false });
  if (!pen) return;
  pen.setTransform(1, 0, 0, 1, 0, 0);
  pen.clearRect(0, 0, dry.width, dry.height);
  const back = nightBackPlate(w, shore, input.bg);
  if (back) pen.drawImage(back, 0, 0);
  paintNightMotion(pen, w, shore, input.motion);
  const front = nightFrontPlate(w, shore);
  if (front) pen.drawImage(front, 0, 0);
  if (!input.songs.length) {
    ctx.drawImage(dry, 0, 0);
    empty(ctx, w, h);
    return;
  }
  const caption = nightCaptionPlate(w, shore, h, input);
  if (caption) pen.drawImage(caption, 0, 0);
  paintNightControls(pen, w, shore, h, input);
  ctx.drawImage(dry, 0, 0);
  const kick = input.wave.length ? input.wave.reduce((sum, value) => sum + value, 0) / input.wave.length : 0.15;
  const { lead, rest, caption: line } = titleLines(input);
  const revision = [lead, rest, line, credit(input), input.index, input.songs.map((song) => song.title).join("\n")].join("|");
  drawWaterReflection(ctx, dry, 0, shore, w, h - shore, input.motion, Math.max(0, Math.min(1, kick)), revision);
  if (w > h * 1.15) {
    const deck = nightDeck(w, h, shore);
    ctx.save();
    ctx.beginPath();
    ctx.rect(deck.x - w * 0.015, shore, w, h - shore);
    ctx.clip();
    const veil = ctx.createLinearGradient(0, shore, 0, h);
    veil.addColorStop(0, "rgba(7,8,12,0)");
    veil.addColorStop(0.1, "rgba(7,8,12,0.05)");
    veil.addColorStop(0.2, "rgba(7,8,12,0.9)");
    veil.addColorStop(1, "rgba(7,8,12,0.96)");
    ctx.fillStyle = veil;
    ctx.fillRect(deck.x - w * 0.015, shore, w, h - shore);
    ctx.restore();
  }
  const sheen = ctx.createLinearGradient(0, shore - h * 0.008, 0, shore + h * 0.02);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.5, "rgba(214, 224, 234, 0.28)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, shore - h * 0.008, w, h * 0.03);
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, start: number, max: number, displayFace = false) {
  let size = start;
  const face = (n: number) => (displayFace ? display(weight, n) : font(weight, n));
  ctx.font = face(size);
  while (size > 10 && text && ctx.measureText(text).width > max) {
    size *= 0.92;
    ctx.font = face(size);
  }
  return size;
}

function paintThumb(ctx: CanvasRenderingContext2D, song: Song, x: number, y: number, size: number) {
  ctx.save();
  roundRect(ctx, x, y, size, size, size * 0.18);
  ctx.clip();
  ctx.fillStyle = "#17151c";
  ctx.fillRect(x, y, size, size);
  const tile = albumTile(song, size);
  if (tile) {
    ctx.drawImage(tile, x, y, size, size);
    ctx.restore();
    return;
  }
  ctx.fillStyle = song.color;
  const tone = Math.abs(song.tone) % 4;
  if (tone === 0) {
    ctx.beginPath();
    ctx.arc(x + size * 0.5, y + size * 0.48, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#121016";
    ctx.beginPath();
    ctx.arc(x + size * 0.5, y + size * 0.48, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (tone === 1) {
    ctx.globalAlpha = 0.95;
    ctx.fillRect(x, y + size * 0.36, size, size * 0.18);
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x, y + size * 0.64, size, size * 0.08);
  } else if (tone === 2) {
    ctx.fillRect(x + size * 0.58, y, size * 0.42, size);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(x + size * 0.32, y + size * 0.62, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + size * 0.18, y + size * 0.82);
    ctx.lineTo(x + size * 0.52, y + size * 0.12);
    ctx.lineTo(x + size * 0.86, y + size * 0.82);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function paintMoodCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, motion: number) {
  const radius = Math.min(w, h) * 0.07;
  const avatar = frameImage(KEY_AVATAR);
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  if (avatar) {
    paintPhoto(ctx, avatar, x, y, w, h);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = Math.max(2, h * 0.012);
    roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const wall = ctx.createLinearGradient(x, y, x + w, y + h);
  wall.addColorStop(0, "#f4eadc");
  wall.addColorStop(0.55, "#e4d2c0");
  wall.addColorStop(1, "#cbb5a2");
  ctx.fillStyle = wall;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = "#243044";
  ctx.fillRect(x + w * 0.1, y + h * 0.08, w * 0.34, h * 0.4);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = Math.max(1, h * 0.008);
  ctx.strokeRect(x + w * 0.1, y + h * 0.08, w * 0.34, h * 0.4);

  const lamp = ctx.createRadialGradient(x + w * 0.72, y + h * 0.34, 2, x + w * 0.72, y + h * 0.34, w * 0.48);
  lamp.addColorStop(0, "rgba(255, 206, 140, 0.95)");
  lamp.addColorStop(1, "rgba(255, 206, 140, 0)");
  ctx.fillStyle = lamp;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = "#2c4636";
  ctx.beginPath();
  ctx.ellipse(x + w * 0.22, y + h * 0.78, w * 0.1, h * 0.14, -0.2 + Math.sin(motion * 0.4) * 0.02, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6a4b3a";
  ctx.fillRect(x + w * 0.2, y + h * 0.86, w * 0.04, h * 0.1);

  ctx.fillStyle = "#8d6b58";
  roundRect(ctx, x + w * 0.52, y + h * 0.58, w * 0.34, h * 0.36, w * 0.04);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = Math.max(2, h * 0.012);
  roundRect(ctx, x, y, w, h, radius);
  ctx.stroke();
  ctx.restore();
}

const glassBlobSlot = { canvas: null as HTMLCanvasElement | null, pen: null as CanvasRenderingContext2D | null };
const glassVigSlot = { canvas: null as HTMLCanvasElement | null, pen: null as CanvasRenderingContext2D | null };
const glassUiSlot = { canvas: null as HTMLCanvasElement | null, pen: null as CanvasRenderingContext2D | null };
let glassBlobKey = "";
let glassVigKey = "";
let glassUiKey = "";
let glassUiAvatar: CanvasImageSource | null = null;
let glassUiCovers: (CanvasImageSource | null)[] = [];

function glassBlobPlate(w: number, h: number, motion: number) {
  const plate = sizedPlate(glassBlobSlot, Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
  if (!plate) return null;
  const key = `${plate.w}x${plate.h}@${Math.floor(Math.abs(motion) * 15)}`;
  if (glassBlobKey !== key) {
    const pen = plate.ctx;
    pen.setTransform(1, 0, 0, 1, 0, 0);
    pen.clearRect(0, 0, plate.w, plate.h);
    pen.save();
    pen.filter = "blur(8px)";
    const blobs: [number, number, number, string][] = [
      [0.18, 0.3, 0.28, "rgba(92, 54, 140, 0.55)"],
      [0.72, 0.22, 0.26, "rgba(40, 70, 120, 0.4)"],
      [0.48, 0.78, 0.3, "rgba(120, 60, 50, 0.28)"],
      [0.86, 0.7, 0.22, "rgba(70, 40, 90, 0.35)"],
    ];
    for (const [bx, by, br, color] of blobs) {
      const drift = Math.sin(motion * 0.35 + bx * 6) * plate.w * 0.01;
      const cx = bx * plate.w + drift;
      const cy = by * plate.h;
      const rad = br * plate.w;
      const glow = pen.createRadialGradient(cx, cy, 2, cx, cy, rad);
      glow.addColorStop(0, color);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      pen.fillStyle = glow;
      pen.beginPath();
      pen.arc(cx, cy, rad, 0, Math.PI * 2);
      pen.fill();
    }
    pen.restore();
    glassBlobKey = key;
  }
  return plate.canvas;
}

function glassVignettePlate(w: number, h: number) {
  const plate = sizedPlate(glassVigSlot, w, h);
  if (!plate) return null;
  const key = `${plate.w}x${plate.h}`;
  if (glassVigKey !== key) {
    const pen = plate.ctx;
    pen.setTransform(1, 0, 0, 1, 0, 0);
    pen.clearRect(0, 0, plate.w, plate.h);
    const vignette = pen.createRadialGradient(
      plate.w * 0.45,
      plate.h * 0.45,
      plate.h * 0.2,
      plate.w * 0.5,
      plate.h * 0.5,
      Math.max(plate.w, plate.h) * 0.72,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.45)");
    pen.fillStyle = vignette;
    pen.fillRect(0, 0, plate.w, plate.h);
    glassVigKey = key;
  }
  return plate.canvas;
}

function glassUiPlate(w: number, h: number, input: DrawInput) {
  const plate = sizedPlate(glassUiSlot, w, h);
  if (!plate) return null;
  const avatar = frameImage(KEY_AVATAR);
  const covers = input.songs.map((song) => coverOf(song));
  const { lead, rest, caption } = titleLines(input);
  const key = [
    plate.w,
    plate.h,
    lead,
    rest,
    caption,
    credit(input),
    input.index,
    input.songs.map((song) => `${song.id}\t${song.title}\t${song.color}\t${song.tone}`).join("\n"),
  ].join("|");
  const sameCovers =
    covers.length === glassUiCovers.length && covers.every((cover, index) => cover === glassUiCovers[index]);
  if (glassUiKey === key && glassUiAvatar === avatar && sameCovers) return plate.canvas;
  plate.ctx.setTransform(1, 0, 0, 1, 0, 0);
  plate.ctx.clearRect(0, 0, plate.w, plate.h);
  paintGlassUi(plate.ctx, plate.w, plate.h, input);
  glassUiKey = key;
  glassUiAvatar = avatar;
  glassUiCovers = covers;
  return plate.canvas;
}

let glassBar = { x: 0, right: 0, y: 0 };

function drawGlass(ctx: CanvasRenderingContext2D, input: DrawInput) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = "#07060b";
  ctx.fillRect(0, 0, w, h);
  if (!paintBlurredPhoto(ctx, w, h)) {
    const blobs = glassBlobPlate(w, h, input.motion);
    if (blobs) ctx.drawImage(blobs, 0, 0, w, h);
  }
  const vignette = glassVignettePlate(w, h);
  if (vignette) ctx.drawImage(vignette, 0, 0);
  if (!input.songs.length) {
    empty(ctx, w, h);
    return;
  }
  const ui = glassUiPlate(w, h, input);
  if (ui) ctx.drawImage(ui, 0, 0);
  const song = input.songs[input.index];
  if (song && glassBar.right > glassBar.x) {
    const played = song.duration > 0 ? input.local / song.duration : 0;
    paintTransport(ctx, glassBar.x, glassBar.right, glassBar.y, h, played);
  }
}

function paintGlassUi(ctx: CanvasRenderingContext2D, w: number, h: number, input: DrawInput) {
  const wide = w > h * 1.05;
  const song = input.songs[input.index];
  const left = w * (wide ? 0.05 : 0.045);
  const textW = wide ? w * 0.52 : w * 0.9;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f5f5f6";
  ctx.font = font(700, h * (wide ? 0.0148 : 0.022));
  ctx.fillText("▶  PLAYLIST", left, h * (wide ? 0.072 : 0.09));

  const { lead: a, rest: b, caption } = titleLines(input);
  const titleTop = h * (wide ? 0.17 : 0.2);
  const startSize = h * (wide ? 0.0519 : 0.072);
  let dividerY = h * (wide ? 0.18 : 0.16);
  let sizeA = 0;
  ctx.fillStyle = "#f7f7f8";
  ctx.letterSpacing = "0.03em";
  if (a) {
    sizeA = fitFont(ctx, a, 600, startSize, textW, true);
    ctx.font = display(600, sizeA);
    ctx.fillText(a, left, titleTop);
    dividerY = titleTop + sizeA * 0.42;
  }
  if (b) {
    const sizeB = fitFont(ctx, b, 500, a ? sizeA : startSize, textW, true);
    const line2 = a ? titleTop + Math.max(sizeA, sizeB) * 1.05 : titleTop;
    ctx.font = display(500, sizeB);
    ctx.fillText(b, left, line2);
    dividerY = line2 + sizeB * 0.42;
  }
  ctx.letterSpacing = "0px";
  if (caption) {
    ctx.fillStyle = "rgba(220,220,226,0.78)";
    ctx.font = font(500, h * (wide ? 0.0167 : 0.02));
    const capY = a || b ? dividerY + h * 0.006 : titleTop;
    ctx.fillText(ellipsis(ctx, caption, textW), left, capY);
    dividerY = capY + h * 0.022;
  }

  const lineW = textW * 0.72;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(1, h * 0.003);
  ctx.beginPath();
  ctx.moveTo(left, dividerY);
  ctx.lineTo(left + lineW, dividerY);
  ctx.stroke();
  ctx.save();
  ctx.translate(left + lineW * 0.5, dividerY);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "#f7f7f8";
  ctx.fillRect(-h * (wide ? 0.005 : 0.008), -h * (wide ? 0.005 : 0.008), h * (wide ? 0.01 : 0.016), h * (wide ? 0.01 : 0.016));
  ctx.restore();

  const cols = wide ? 2 : 1;
  const rows = 6;
  const pad = h * (wide ? 0.012 : 0.012);
  const panelY = dividerY + h * (wide ? 0.022 : 0.035);
  const panelBottom = h * (wide ? 0.95 : 0.93);
  const panelH = Math.max(h * 0.28, panelBottom - panelY);
  const transportTop = panelY + panelH - h * (wide ? 0.09 : 0.1);
  const rowH = Math.max(8, (transportTop - panelY - pad) / rows);
  const panelW = wide ? w * 0.58 : w * 0.91;
  ctx.save();
  roundRect(ctx, left, panelY, panelW, panelH, h * 0.02);
  ctx.fillStyle = "rgba(16, 12, 22, 0.78)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = Math.max(1, h * 0.002);
  ctx.stroke();
  ctx.restore();
  glassBar = { x: left + pad, right: left + panelW - pad, y: transportTop + h * 0.012 };

  const pageSize = cols * rows;
  const page = Math.floor(input.index / pageSize) * pageSize;
  const visible = input.songs.slice(page, page + pageSize);
  const colW = panelW / cols;
  const songSize = wide ? Math.min(h * 0.024, rowH * 0.34) : rowH * 0.28;

  visible.forEach((item, offset) => {
    const col = cols === 2 && offset >= rows ? 1 : 0;
    const row = cols === 2 && offset >= rows ? offset - rows : offset;
    const index = page + offset;
    const x = left + col * colW + pad;
    const y = panelY + row * rowH;
    const active = index === input.index;
    const thumb = wide ? Math.min(rowH * 0.46, h * 0.055) : Math.min(rowH * 0.62, h * 0.055);
    const ty = y + (rowH - thumb) / 2;
    if (active) {
      ctx.save();
      roundRect(ctx, x - pad * 0.4, y + rowH * 0.12, colW - pad, rowH * 0.76, rowH * 0.2);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fill();
      ctx.restore();
    }
    paintThumb(ctx, item, x, ty, thumb);
    const tx = x + thumb + pad * 0.7;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = active ? "#ffffff" : "rgba(244,244,246,0.92)";
    ctx.font = font(active ? 600 : 500, songSize);
    ctx.fillText(ellipsis(ctx, item.title, colW - thumb - pad * 3), tx, y + rowH * 0.5);
  });

  if (wide && song) {
    const cardX = w * 0.68;
    const cardW = w * 0.27;
    const titleY = glassBar.y;
    const cardY = h * 0.15;
    const cardH = Math.max(h * 0.42, titleY - h * 0.032 - cardY);
    paintMoodCard(ctx, cardX, cardY, cardW, cardH, 0);
    const capX = cardX + cardW;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f7f7f8";
    ctx.font = display(600, h * 0.0204);
    ctx.fillText(ellipsis(ctx, song.title.toUpperCase(), cardW * 0.9), capX - h * 0.016, titleY);
    const cardCredit = credit(input);
    if (cardCredit) {
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "rgba(220,220,226,0.78)";
      ctx.font = font(500, h * 0.016);
      ctx.fillText(ellipsis(ctx, cardCredit, cardW * 0.8), capX - h * 0.016, titleY + h * 0.04);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = Math.max(1.25, h * 0.0022);
    ctx.beginPath();
    ctx.moveTo(capX, titleY - h * 0.016);
    ctx.lineTo(capX, titleY + h * 0.016);
    ctx.stroke();
  } else if (song) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#f7f7f8";
    ctx.font = font(700, h * 0.028);
    ctx.fillText(ellipsis(ctx, song.title.toUpperCase(), w * 0.8), left, h * 0.96);
  }
}

function empty(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = INK;
  ctx.font = font(600, h * 0.04);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Thêm bài hát", w / 2, h * 0.46);
  ctx.fillStyle = MUTED;
  ctx.font = font(400, h * 0.028);
  ctx.fillText("Danh sách sẽ được đánh số và chạy theo nhạc", w / 2, h * 0.53);
}

let brandMark: HTMLCanvasElement | null = null;
let brandLoading = false;

function ensureBrand() {
  if (brandMark || brandLoading || typeof document === "undefined") return brandMark;
  brandLoading = true;
  const img = new Image();
  img.onload = () => {
    const size = 480;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const pen = canvas.getContext("2d");
    if (!pen) return;
    pen.drawImage(img, 0, 0, size, size);
    const frame = pen.getImageData(0, 0, size, size);
    const px = frame.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i] ?? 0;
      const g = px[i + 1] ?? 0;
      const b = px[i + 2] ?? 0;
      const luma = r * 0.3 + g * 0.55 + b * 0.15;
      px[i + 3] = luma < 42 ? 0 : Math.min(255, (luma - 36) * 5);
    }
    pen.putImageData(frame, 0, 0);
    let minX = size;
    let minY = size;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if ((px[(y * size + x) * 4 + 3] ?? 0) < 16) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    const crop = document.createElement("canvas");
    const pad = 8;
    const cw = Math.max(2, maxX - minX + pad * 2);
    const ch = Math.max(2, maxY - minY + pad * 2);
    crop.width = cw;
    crop.height = ch;
    crop.getContext("2d")?.drawImage(canvas, minX - pad, minY - pad, cw, ch, 0, 0, cw, ch);
    brandMark = crop;
  };
  img.src = "/swans.jpg";
  return brandMark;
}

function paintBrand(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const mark = ensureBrand();
  const logoH = h * 0.036;
  const right = w - w * 0.03;
  const top = h * 0.026;
  ctx.save();
  let markW = 0;
  if (mark) {
    markW = logoH * (mark.width / Math.max(1, mark.height));
    ctx.drawImage(mark, right - markW, top, markW, logoH);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#c6a35a";
  ctx.font = `${Math.max(11, h * 0.018)}px "Great Vibes", cursive`;
  const label = "SoraSleep";
  const anchor = mark ? right - markW / 2 : right;
  ctx.fillText(label, anchor, top + (mark ? logoH : 0) + h * 0.006);
  ctx.restore();
}

function releaseSlot(slot: { canvas: HTMLCanvasElement | null }) {
  if (!slot.canvas) return;
  slot.canvas.width = 1;
  slot.canvas.height = 1;
}

let heldLook: DrawInput["look"] | "" = "";

function retainLook(look: DrawInput["look"]) {
  if (heldLook === look) return;
  if (heldLook === "poster") {
    releaseSlot(posterBlobSlot);
    releaseSlot(posterShadeSlot);
    releaseSlot(posterChromeSlot);
    posterBlobKey = "";
    posterShadeKey = "";
    posterChromeKey = "";
  } else if (heldLook === "night") {
    releaseSlot(backSlot);
    releaseSlot(frontSlot);
    releaseSlot(typeSlot);
    nightBackKey = "";
    nightFrontKey = "";
    nightTypeKey = "";
    if (dryBuf) {
      dryBuf.width = 1;
      dryBuf.height = 1;
    }
    releaseWater();
  } else if (heldLook === "glass") {
    releaseSlot(glassBlobSlot);
    releaseSlot(glassVigSlot);
    releaseSlot(glassUiSlot);
    glassBlobKey = "";
    glassVigKey = "";
    glassUiKey = "";
  }
  heldLook = look;
}

export function drawList(ctx: CanvasRenderingContext2D, input: DrawInput) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  retainLook(input.look);
  if (input.look === "poster") drawPoster(ctx, input);
  else if (input.look === "night") drawNight(ctx, input);
  else drawGlass(ctx, input);
  paintWeather(ctx, w, h, input.motion, input.weather, input.fx);
  paintBrand(ctx, w, h);
}
