export function synthSong(ctx: BaseAudioContext, tone: number, seconds: number) {
  const sr = 44100;
  const length = Math.max(1, Math.floor(sr * seconds));
  const buffer = ctx.createBuffer(2, length, sr);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const roots = [220, 174.61, 196, 246.94, 164.81, 233.08];
  const root = roots[tone % roots.length] ?? 220;
  const scales = [
    [0, 3, 7, 10, 12, 7],
    [0, 5, 7, 12, 10, 3],
    [0, 2, 7, 9, 12, 7],
    [0, 3, 5, 10, 12, 15],
    [0, 7, 3, 12, 10, 7],
    [0, 4, 7, 11, 12, 7],
  ];
  const scale = scales[tone % scales.length] ?? scales[0];
  const bpm = [92, 80, 108, 72, 100, 88][tone % 6] ?? 90;
  const half = 60 / bpm / 2;

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const step = Math.floor(t / half);
    const note = scale[step % scale.length] ?? 0;
    const freq = root * 2 ** (note / 12);
    const local = (t / half) % 1;
    const env = Math.sin(Math.min(1, local * 6) * Math.PI * 0.5) * Math.exp(-local * (tone % 6 === 3 ? 1.2 : 2.4));
    const beat = (60 / bpm);
    const bassEnv = Math.exp(-(t % beat) * 3);
    const bass = Math.sin(2 * Math.PI * (root / 2) * t) * 0.16 * bassEnv;
    const lead = Math.sin(2 * Math.PI * freq * t) * 0.2 * env;
    const harm = Math.sin(2 * Math.PI * freq * 2 * t) * 0.05 * env;
    const pad = Math.sin(2 * Math.PI * root * t) * 0.05 + Math.sin(2 * Math.PI * root * 1.5 * t) * 0.03;
    const fade = Math.min(1, t / 0.05, (seconds - t) / 0.35);
    const mixed = Math.tanh((bass + lead + harm + pad) * 1.35) * Math.max(0, fade);
    const wide = Math.sin(2 * Math.PI * freq * 1.003 * t) * 0.06 * env;
    left[i] = mixed;
    right[i] = mixed * 0.9 + wide;
  }
  return buffer;
}
