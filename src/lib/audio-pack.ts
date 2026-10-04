import {
  ALL_FORMATS,
  AudioBufferSource,
  AudioSampleSink,
  BlobSource,
  BufferSource,
  BufferTarget,
  Input,
  Output,
  Quality,
  WebMOutputFormat,
} from "mediabunny";

/** One peak every 1/120 s, enough for the export waveform without keeping PCM. */
export const PEAK_HZ = 120;

export type PackedMusic = {
  bytes: ArrayBuffer;
  duration: number;
  peaks: Float32Array;
};

type Acc = { filled: number; peak: number; peaks: number[]; bin: number };

function absorb(audio: AudioBuffer, acc: Acc) {
  const data = audio.getChannelData(0);
  const bin = acc.bin || Math.max(1, Math.round(audio.sampleRate / PEAK_HZ));
  acc.bin = bin;
  let index = 0;
  while (index < data.length) {
    const take = Math.min(bin - acc.filled, data.length - index);
    let peak = acc.peak;
    for (let i = 0; i < take; i += 4) peak = Math.max(peak, Math.abs(data[index + i] ?? 0));
    index += take;
    acc.filled += take;
    acc.peak = peak;
    if (acc.filled >= bin) {
      acc.peaks.push(Math.min(1, peak * 1.6));
      acc.filled = 0;
      acc.peak = 0;
    }
  }
}

/** True for uncompressed or oversized masters. A 100 MB WAV is packed, not stored. */
export function shouldPack(file: File) {
  const name = file.name.toLowerCase();
  if (/\.(wav|wave|aiff|aif|flac|pcm)$/.test(name)) return true;
  if (/wav|wave|flac|aiff|pcm/i.test(file.type)) return true;
  return file.size > 15 * 1024 * 1024;
}

/**
 * Read a master in small slices and write 48 kHz stereo Opus.
 * A 100 MB WAV is about 10 minutes and lands near 12 MB. The decoded song is not kept.
 */
export async function packFile(file: Blob, onProgress?: (ratio: number) => void): Promise<PackedMusic> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file, { maxCacheSize: 8 * 1024 * 1024 }),
  });
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  let started = false;
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("Không đọc được file nhạc này.");
    const hinted = (await input.getDurationFromMetadata()) ?? 0;
    const sink = new AudioSampleSink(track);
    const audio = new AudioBufferSource({
      codec: "opus",
      quality: new Quality({ bitrate: 160_000, bitrateMode: "variable" }),
      transform: { numberOfChannels: 2, sampleRate: 48000 },
    });
    output.addAudioTrack(audio);
    await output.start();
    started = true;
    const acc: Acc = { filled: 0, peak: 0, peaks: [], bin: 0 };
    let filled = 0;
    let reported = -1;
    for await (const sample of sink.samples()) {
      const decoded = sample.toAudioBuffer();
      const at = sample.timestamp;
      sample.close();
      absorb(decoded, acc);
      await audio.add(decoded);
      filled = at + decoded.duration;
      if (onProgress && hinted > 0) {
        const pct = Math.min(99, Math.round((filled / hinted) * 100));
        if (pct !== reported) {
          reported = pct;
          onProgress(pct / 100);
        }
      }
    }
    if (acc.filled > 0) acc.peaks.push(Math.min(1, acc.peak * 1.6));
    audio.close();
    await output.finalize();
    started = false;
    const bytes = output.target instanceof BufferTarget ? output.target.buffer : null;
    if (!bytes) throw new Error("Không nén được file nhạc");
    let duration = Math.max(0.1, filled || hinted);
    try {
      const probe = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) });
      duration = Math.max(0.1, await probe.computeDuration());
      probe.dispose();
    } catch {
      /* the running clock is enough */
    }
    onProgress?.(1);
    return { bytes, duration, peaks: Float32Array.from(acc.peaks) };
  } catch (err) {
    if (started) {
      try {
        await output.cancel();
      } catch {
        /* already closed */
      }
    }
    throw err instanceof Error ? err : new Error("Không nén được file nhạc");
  } finally {
    input.dispose();
  }
}
