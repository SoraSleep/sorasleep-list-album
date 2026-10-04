import { formatTime, padIndex, type LookId, type Song } from "@/lib/playlist";

export type DrawInput = {
  songs: Song[];
  index: number;
  local: number;
  total: number;
  time: number;
  smooth: number;
  motion: number;
  look: LookId;
  name: string;
  showArtist: boolean;
  showWave: boolean;
  wave: number[];
  glide: number;
};

const INK = "#f4f4f5";
const MUTED = "#a1a1aa";
const FAINT = "#71717a";
const SAND = "#d4b483";
const SILVER = "#c8ccd4";
const BG = "#0a0a0b";

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

function font(weight: number, size: number, italic = false) {
  return `${italic ? "italic " : ""}${weight} ${Math.max(8, size)}px "Be Vietnam Pro", "DM Sans", sans-serif`;
}

function paintBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.42, Math.min(w, h) * 0.04, w * 0.5, h * 0.42, Math.max(w, h) * 0.72);
  glow.addColorStop(0, hexAlpha(color, 0.28));
  glow.addColorStop(1, "rgba(10,10,11,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.58)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

function header(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  name: string,
  index: number,
  count: number,
  time: number,
  total: number,
) {
  const pad = w * 0.06;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = SAND;
  ctx.font = font(600, h * 0.028);
  ctx.fillText("DANH SÁCH", pad, h * 0.1);
  ctx.fillStyle = INK;
  ctx.font = font(600, h * 0.052);
  ctx.fillText(ellipsis(ctx, name || "Playlist", w * 0.62), pad, h * 0.16);
  ctx.textAlign = "right";
  ctx.fillStyle = SILVER;
  ctx.font = font(600, h * 0.04);
  ctx.fillText(`${padIndex(index)}  /  ${padIndex(Math.max(0, count - 1))}`, w - pad, h * 0.11);
  ctx.fillStyle = FAINT;
  ctx.font = font(500, h * 0.028);
  ctx.fillText(`${formatTime(time)}   ${formatTime(total)}`, w - pad, h * 0.155);
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

function edgeAlpha(y: number, h: number) {
  const band = h * 0.16;
  return Math.max(0, Math.min(1, y / band, (h - y) / band));
}

function drawNumbered(ctx: CanvasRenderingContext2D, w: number, h: number, input: DrawInput, vertical: boolean) {
  const { songs, smooth, showArtist, showWave, wave, motion, time } = input;
  const focus = vertical ? h * 0.46 : h * 0.5;
  const rowH = vertical ? h * 0.078 : h * 0.1;
  const pad = w * (vertical ? 0.08 : 0.07);
  const numW = w * (vertical ? 0.16 : 0.1);
  const playing = input.time > 0.05 || input.local > 0.05;

  songs.forEach((song, i) => {
    const dist = i - smooth;
    const y = focus + dist * rowH;
    if (y < h * 0.22 || y > h * 0.9) return;
    const ad = Math.abs(dist);
    const active = ad < 0.45;
    const alpha = edgeAlpha(y, h) * Math.max(0, 1 - ad * 0.28);
    ctx.save();
    ctx.globalAlpha = alpha;
    const rowTop = y - rowH * 0.42;
    if (active) {
      ctx.fillStyle = "rgba(244,244,245,0.06)";
      roundRect(ctx, pad * 0.55, rowTop, w - pad * 1.1, rowH * 0.84, h * 0.012);
      ctx.fill();
      ctx.fillStyle = SAND;
      ctx.fillRect(pad * 0.55, rowTop, Math.max(3, w * 0.004), rowH * 0.84);
      const p = song.duration > 0 ? input.local / song.duration : 0;
      ctx.fillStyle = SAND;
      roundRect(ctx, pad + numW, rowTop + rowH * 0.7, (w - pad * 2 - numW) * Math.max(0, Math.min(1, p)), Math.max(2, h * 0.004), 2);
      ctx.fill();
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = active ? SAND : FAINT;
    ctx.font = font(700, active ? h * 0.055 : h * 0.036);
    ctx.fillText(padIndex(i), pad, y);
    ctx.fillStyle = active ? INK : MUTED;
    ctx.font = font(active ? 600 : 500, active ? h * 0.046 : h * 0.034);
    const titleMax = w - pad * 2 - numW - w * 0.12;
    ctx.fillText(ellipsis(ctx, song.title, titleMax), pad + numW, active && showArtist ? y - rowH * 0.12 : y);
    if (active && showArtist && song.artist) {
      ctx.fillStyle = MUTED;
      ctx.font = font(400, h * 0.026);
      ctx.fillText(ellipsis(ctx, song.artist, titleMax), pad + numW, y + rowH * 0.2);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = active ? SILVER : FAINT;
    ctx.font = font(500, h * 0.026);
    ctx.fillText(formatTime(song.duration), w - pad, y);
    ctx.restore();
  });

  if (showWave) {
    const wy = h * (vertical ? 0.8 : 0.84);
    waveOf(ctx, pad, wy, w * (vertical ? 0.84 : 0.38), h * 0.045, wave, motion, playing || time > 0);
  }
}

function drawTicker(ctx: CanvasRenderingContext2D, w: number, h: number, input: DrawInput) {
  const song = input.songs[input.index];
  const shift = (input.index - input.smooth) * h * 0.06;
  const pad = w * 0.07;
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = SAND;
  ctx.font = font(700, h * 0.16);
  ctx.globalAlpha = 0.9;
  ctx.fillText(song ? padIndex(input.index) : "00", pad, h * 0.4 + shift);
  if (song) {
    ctx.fillStyle = INK;
    ctx.font = font(600, h * 0.07);
    ctx.fillText(ellipsis(ctx, song.title, w - pad * 2), pad, h * 0.56 + shift);
    if (input.showArtist && song.artist) {
      ctx.fillStyle = MUTED;
      ctx.font = font(400, h * 0.034);
      ctx.fillText(ellipsis(ctx, song.artist, w - pad * 2), pad, h * 0.64 + shift);
    }
  }
  ctx.restore();

  const bandY = h * 0.74;
  const bandH = h * 0.12;
  ctx.fillStyle = "rgba(244,244,245,0.04)";
  ctx.fillRect(0, bandY, w, bandH);
  ctx.strokeStyle = "rgba(212,180,131,0.45)";
  ctx.lineWidth = Math.max(1, h * 0.002);
  ctx.beginPath();
  ctx.moveTo(0, bandY);
  ctx.lineTo(w, bandY);
  ctx.moveTo(0, bandY + bandH);
  ctx.lineTo(w, bandY + bandH);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bandY, w, bandH);
  ctx.clip();
  ctx.textBaseline = "middle";
  ctx.font = font(600, bandH * 0.38);
  const label = (item: Song, index: number) => `${padIndex(index)}   ${item.title}`;
  const gap = w * 0.06;
  const widths = input.songs.map((item, index) => ctx.measureText(label(item, index)).width + gap);
  const loop = Math.max(1, widths.reduce((sum, item) => sum + item, 0));
  const speed = h * 0.055 * input.glide;
  let x = -((input.motion * speed) % loop);
  ctx.textAlign = "left";
  for (let pass = 0; pass < 3; pass++) {
    input.songs.forEach((item, index) => {
      const active = index === input.index;
      ctx.fillStyle = active ? SAND : SILVER;
      ctx.fillText(label(item, index), x, bandY + bandH / 2);
      x += widths[index] ?? gap;
    });
  }
  ctx.restore();

  if (input.showWave) {
    waveOf(ctx, pad, h * 0.9, w * 0.36, h * 0.05, input.wave, input.motion, true);
  }
}

function drawDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rot: number,
  color: string,
  label: string,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#141416";
  ctx.fill();
  ctx.lineWidth = Math.max(1, radius * 0.012);
  for (let i = 3; i <= 10; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * (0.22 + i * 0.065), 0, Math.PI * 2);
    ctx.strokeStyle = i % 2 ? "rgba(244,244,245,0.08)" : "rgba(244,244,245,0.16)";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = BG;
  ctx.font = font(700, radius * 0.22);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy);
}

function drawVinyl(ctx: CanvasRenderingContext2D, w: number, h: number, input: DrawInput, vertical: boolean) {
  const song = input.songs[input.index];
  const cx = vertical ? w * 0.5 : w * 0.28;
  const cy = vertical ? h * 0.36 : h * 0.52;
  const radius = (vertical ? w : h) * (vertical ? 0.22 : 0.28);
  drawDisc(ctx, cx, cy, radius, input.motion * 0.7, song?.color ?? SILVER, song ? padIndex(input.index) : "00");

  const left = vertical ? w * 0.08 : w * 0.5;
  const focus = vertical ? h * 0.62 : h * 0.48;
  const rowH = h * (vertical ? 0.055 : 0.072);
  const width = w - left - w * 0.06;
  input.songs.forEach((item, i) => {
    const y = focus + (i - input.smooth) * rowH;
    if (y < h * 0.18 || y > h * 0.94) return;
    const active = Math.abs(i - input.smooth) < 0.45;
    ctx.globalAlpha = edgeAlpha(y, h) * (active ? 1 : 0.55);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = active ? SAND : FAINT;
    ctx.font = font(700, h * 0.03);
    ctx.fillText(padIndex(i), left, y);
    ctx.fillStyle = active ? INK : MUTED;
    ctx.font = font(active ? 600 : 500, h * (active ? 0.034 : 0.028));
    ctx.fillText(ellipsis(ctx, item.title, width * 0.72), left + w * 0.08, y);
    ctx.globalAlpha = 1;
  });

  if (song && input.showArtist) {
    ctx.fillStyle = MUTED;
    ctx.font = font(400, h * 0.026);
    ctx.textAlign = vertical ? "center" : "left";
    ctx.fillText(ellipsis(ctx, song.artist || song.title, w * 0.4), vertical ? w / 2 : left, vertical ? h * 0.46 : h * 0.9);
  }
}

function drawLake(ctx: CanvasRenderingContext2D, w: number, h: number, input: DrawInput) {
  const song = input.songs[input.index];
  const shift = (input.index - input.smooth) * h * 0.04;
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = SILVER;
  ctx.font = font(700, h * 0.42);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(song ? padIndex(input.index) : "00", w / 2, h * 0.42);
  ctx.restore();

  if (!song) return;
  const titleY = h * 0.48 + shift;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  ctx.font = font(500, h * 0.062, true);
  const title = ellipsis(ctx, song.title, w * 0.8);
  ctx.fillText(title, w / 2, titleY);

  ctx.save();
  ctx.translate(w / 2, titleY + h * 0.04);
  ctx.scale(1, -0.55);
  ctx.font = font(500, h * 0.062, true);
  const grad = ctx.createLinearGradient(0, -h * 0.08, 0, h * 0.02);
  grad.addColorStop(0, "rgba(244,244,245,0.28)");
  grad.addColorStop(1, "rgba(244,244,245,0)");
  ctx.fillStyle = grad;
  ctx.fillText(title, 0, 0);
  ctx.restore();

  if (input.showArtist && song.artist) {
    ctx.fillStyle = SAND;
    ctx.font = font(500, h * 0.028);
    ctx.fillText(song.artist, w / 2, titleY + h * 0.1);
  }

  const rowH = h * 0.045;
  input.songs.forEach((item, i) => {
    if (i === input.index) return;
    const y = h * 0.72 + (i - input.smooth) * rowH;
    if (y < h * 0.64 || y > h * 0.92) return;
    ctx.globalAlpha = 0.7 * edgeAlpha(y, h);
    ctx.textAlign = "center";
    ctx.fillStyle = MUTED;
    ctx.font = font(500, h * 0.026);
    ctx.fillText(`${padIndex(i)}    ${ellipsis(ctx, item.title, w * 0.7)}`, w / 2, y);
    ctx.globalAlpha = 1;
  });
}

const LIME = "#e2f04a";

function splitTitle(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { lead: "NHẠC", rest: "CHILL" };
  return { lead: (parts[0] ?? "NHẠC").toUpperCase(), rest: parts.slice(1).join(" ").toUpperCase() };
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

function drawPoster(ctx: CanvasRenderingContext2D, input: DrawInput) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const song = input.songs[input.index];
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, w, h);
  const blobs: Array<[number, number, number, string]> = [
    [0.18, 0.42, 0.42, song?.color ?? "#243044"],
    [0.48, 0.22, 0.28, "#1a2438"],
    [0.08, 0.82, 0.26, "#2a2218"],
    [0.62, 0.78, 0.34, "#142028"],
  ];
  blobs.forEach(([bx, by, br, color], i) => {
    const ox = Math.sin(input.motion * 0.18 + i) * w * 0.02;
    const oy = Math.cos(input.motion * 0.14 + i * 1.3) * h * 0.015;
    const cx = bx * w + ox;
    const cy = by * h + oy;
    const rad = Math.max(w, h) * br;
    const glow = ctx.createRadialGradient(cx, cy, rad * 0.05, cx, cy, rad);
    glow.addColorStop(0, hexAlpha(color, 0.5));
    glow.addColorStop(1, "rgba(7,8,12,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  });
  const shade = ctx.createLinearGradient(w * 0.32, 0, w, 0);
  shade.addColorStop(0, "rgba(7,8,12,0)");
  shade.addColorStop(0.45, "rgba(7,8,12,0.28)");
  shade.addColorStop(1, "rgba(7,8,12,0.55)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);

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
    const pick = input.songs[(input.index + i) % input.songs.length];
    if (!pick) return;
    const bob = Math.sin(input.motion * 0.7 + i * 1.4) * h * 0.012;
    const real = input.songs.indexOf(pick);
    paintSleeve(
      ctx,
      pick,
      real < 0 ? i : real,
      slot.x * w,
      slot.y * h + bob,
      (wide ? h : w) * slot.s,
      slot.r,
    );
  });

  const mark = h * (wide ? 0.028 : 0.02);
  const mx = w - w * 0.06;
  const my = h * (wide ? 0.1 : 0.055);
  ctx.beginPath();
  ctx.arc(mx - mark * 3.2, my, mark, 0, Math.PI * 2);
  ctx.strokeStyle = "#f4f4f5";
  ctx.lineWidth = Math.max(1.25, mark * 0.16);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mx - mark * 3.2, my, mark * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = LIME;
  ctx.fill();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f4f4f5";
  ctx.font = font(700, mark * 0.95);
  ctx.fillText("SORA", mx - mark * 1.7, my - mark * 0.38);
  ctx.fillText("LIST", mx - mark * 1.7, my + mark * 0.48);

  const { lead, rest } = splitTitle(input.name);
  const titleSize = h * (wide ? 0.09 : 0.055);
  const titleX = wide ? w * 0.5 : w * 0.07;
  const titleY = wide ? h * 0.2 : h * 0.46;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = LIME;
  ctx.font = font(700, titleSize);
  ctx.fillText(lead, titleX, titleY);
  const leadW = ctx.measureText(lead).width;
  if (rest) {
    ctx.fillStyle = "#f7f7f8";
    ctx.font = font(600, titleSize * 0.92, true);
    ctx.fillText(ellipsis(ctx, rest, w - titleX - leadW - w * 0.08), titleX + leadW + w * 0.012, titleY);
  }
  ctx.strokeStyle = "rgba(244,244,245,0.9)";
  ctx.lineWidth = Math.max(1, h * 0.003);
  ctx.beginPath();
  ctx.moveTo(titleX, titleY + h * 0.018);
  ctx.lineTo(titleX + Math.max(leadW * 0.72, w * 0.08), titleY + h * 0.018);
  ctx.stroke();
  ctx.fillStyle = "rgba(226,226,230,0.82)";
  ctx.font = font(500, h * (wide ? 0.026 : 0.02), true);
  const sub = ellipsis(ctx, `(giai điệu ${input.name})`, w * (wide ? 0.42 : 0.8));
  ctx.fillText(sub, titleX, titleY + h * (wide ? 0.055 : 0.042));

  const cols = wide ? 2 : 1;
  const maxRows = wide ? 6 : 8;
  const page = maxRows * cols;
  const start = Math.floor(input.index / page) * page;
  const visible = input.songs.slice(start, start + page);
  const perCol = cols === 2 ? Math.ceil(visible.length / 2) : visible.length;
  const rowH = h * (wide ? 0.088 : 0.058);
  const listTop = titleY + h * (wide ? 0.1 : 0.07);
  const colW = wide ? w * 0.22 : w * 0.86;
  const colX = [titleX, titleX + w * 0.24];

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
    ctx.font = font(600, rowH * 0.28);
    ctx.fillText(num, x, y);
    const numW = ctx.measureText(num).width + rowH * 0.16;
    ctx.fillStyle = active ? "#ffffff" : "rgba(244,244,245,0.92)";
    ctx.font = font(700, rowH * 0.3);
    const title = ellipsis(ctx, item.title, colW - numW);
    ctx.fillText(title, x + numW, y);
    if (active) {
      const tw = Math.max(8, ctx.measureText(title).width);
      const p = item.duration > 0 ? input.local / item.duration : 0;
      const barY = y + rowH * 0.08;
      const barH = Math.max(1.5, h * 0.0035);
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(x + numW, barY, tw, barH);
      ctx.fillStyle = LIME;
      ctx.fillRect(x + numW, barY, tw * Math.max(0, Math.min(1, p)), barH);
    }
    if (input.showArtist && item.artist) {
      ctx.fillStyle = "rgba(186,186,194,0.9)";
      ctx.font = font(500, rowH * 0.2);
      ctx.fillText(ellipsis(ctx, item.artist, colW - numW), x + numW, y + rowH * 0.3);
    }
  });

  if (input.showWave) {
    const samples = input.wave.some((value) => value > 0.04)
      ? input.wave
      : Array.from({ length: 28 }, (_, i) => 0.22 + 0.18 * Math.sin(input.motion * 1.6 + i * 0.45));
    waveOf(ctx, titleX, h * (wide ? 0.9 : 0.93), w * (wide ? 0.22 : 0.56), h * 0.045, samples, input.motion, true);
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

export function drawList(ctx: CanvasRenderingContext2D, input: DrawInput) {
  if (input.look === "poster") {
    drawPoster(ctx, input);
    return;
  }
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const song = input.songs[input.index];
  paintBackdrop(ctx, w, h, song?.color ?? SILVER);
  if (!input.songs.length) {
    empty(ctx, w, h);
    return;
  }
  const vertical = h > w;
  header(ctx, w, h, input.name, input.index, input.songs.length, input.time, input.total);
  if (input.look === "ticker") drawTicker(ctx, w, h, input);
  else if (input.look === "vinyl") drawVinyl(ctx, w, h, input, vertical);
  else if (input.look === "lake") drawLake(ctx, w, h, input);
  else drawNumbered(ctx, w, h, input, vertical);
}
