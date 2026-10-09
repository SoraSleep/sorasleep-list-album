import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { engine } from "@/lib/engine";
import { packFile, shouldPack } from "@/lib/audio-pack";
import { deleteAudio, peakKey, saveAudio } from "@/lib/idb-audio";
import { albumKey, clearImage } from "@/lib/images";
import { DEMO_SONGS, formatTime, locate, MAX_SONGS, padIndex, parseLines, titleFromFile } from "@/lib/playlist";
import { makeSong, useProject } from "@/lib/store";

export function SongBin() {
  const songs = useProject((s) => s.songs);
  const artist = useProject((s) => s.artist);
  const currentTime = useProject((s) => s.currentTime);
  const patchSong = useProject((s) => s.patchSong);
  const setArtist = useProject((s) => s.setArtist);
  const addSongs = useProject((s) => s.addSongs);
  const removeSong = useProject((s) => s.removeSong);
  const moveSong = useProject((s) => s.moveSong);
  const replaceSongs = useProject((s) => s.replaceSongs);
  const [bulk, setBulk] = useState("");
  const [open, setOpen] = useState(false);

  function stopIfPlaying() {
    if (engine.playing) {
      engine.pause();
      useProject.setState({ playing: false, currentTime: engine.now() });
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const existing = useProject.getState().songs.filter((song) => song.source !== "demo");
    const room = MAX_SONGS - existing.length;
    if (room <= 0) {
      toast.error("Một list tối đa 12 bài. Xóa bớt rồi tải tiếp.");
      return;
    }
    const picked = Array.from(files).slice(0, room);
    if (picked.length < files.length) toast.message("Chỉ giữ đủ 12 bài.");
    const ctx = engine.ensure();
    const next = [];
    for (const file of picked) {
      try {
        const song = makeSong(existing.length + next.length, {
          title: titleFromFile(file.name),
          artist: "",
          duration: 15,
          source: "file",
        });
        if (shouldPack(file)) {
          const mb = Math.max(1, Math.round(file.size / (1024 * 1024)));
          let shown = -1;
          toast.loading(`Đang nén ${file.name} (${mb} MB)…`, { id: "pack" });
          const packed = await packFile(file, (ratio) => {
            const pct = Math.round(ratio * 100);
            if (pct === shown) return;
            shown = pct;
            toast.loading(`Đang nén ${file.name} (${mb} MB)… ${pct}%`, { id: "pack" });
          });
          toast.dismiss("pack");
          song.duration = packed.duration;
          engine.remember(song.id, packed.bytes);
          engine.setPeaks(song.id, packed.peaks);
          const peaks = new ArrayBuffer(packed.peaks.byteLength);
          new Float32Array(peaks).set(packed.peaks);
          void saveAudio(song.id, packed.bytes).catch(() => undefined);
          void saveAudio(peakKey(song.id), peaks).catch(() => undefined);
        } else {
          const raw = await file.arrayBuffer();
          const decoded = await ctx.decodeAudioData(raw.slice(0));
          song.duration = decoded.duration;
          engine.remember(song.id, raw);
          engine.setBuffer(song.id, decoded);
          void saveAudio(song.id, raw).catch(() => undefined);
        }
        next.push(song);
      } catch {
        toast.dismiss("pack");
        toast.error(`Không đọc được ${file.name}`);
      }
    }
    if (next.length) {
      if (engine.playing) engine.pause();
      for (const song of useProject.getState().songs) {
        if (song.source === "demo") engine.forget(song.id);
      }
      replaceSongs([...existing, ...next]);
      useProject.setState({ playing: false, currentTime: 0 });
      const first = next[0]?.title;
      toast.success(next.length === 1 && first ? `Đã thêm “${first}”` : `Đã thêm ${next.length} bài theo tên file`);
    }
  }

  function addBlank() {
    const count = useProject.getState().songs.length;
    if (count >= MAX_SONGS) {
      toast.error("Một list tối đa 12 bài.");
      return;
    }
    addSongs([makeSong(count, { title: `Bài ${count + 1}`, artist: "", source: "none", duration: 15 })]);
  }

  function addBulk() {
    const rows = parseLines(bulk);
    if (!rows.length) return;
    const count = useProject.getState().songs.length;
    const room = MAX_SONGS - count;
    if (room <= 0) {
      toast.error("Một list tối đa 12 bài.");
      return;
    }
    addSongs(rows.slice(0, room).map((row, index) => makeSong(count + index, { ...row, source: "none", duration: 15 })));
    if (rows.length > room) toast.message("Chỉ giữ đủ 12 bài.");
    setBulk("");
    setOpen(false);
  }

  const place = locate(songs, currentTime);

  return (
    <aside className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="font-display text-sm font-semibold">Bài hát</p>
          <p className="text-xs text-faint">{songs.length}/{MAX_SONGS} · tên file thành tên bài</p>
        </div>
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg">
          <Upload className="size-4" />
          Tải nhạc
          <input
            type="file"
            accept="audio/*,.wav,.wave,.flac,.mp3,.m4a,.aac,.ogg"
            multiple
            className="sr-only"
            onChange={(event) => {
              void onFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <label className="block px-3 pb-3">
        <span className="mb-1 block text-xs text-muted">Nghệ sĩ</span>
        <input
          value={artist}
          maxLength={80}
          placeholder="Tên của bạn, dùng cho cả list"
          aria-label="Tên nghệ sĩ"
          onChange={(event) => setArtist(event.target.value)}
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-faint focus:border-silver"
        />
      </label>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {songs.map((song, index) => {
          const on = index === place.index;
          const songProgress = on && song.duration > 0 ? Math.min(100, Math.max(0, (place.local / song.duration) * 100)) : 0;
          return (
            <div
              key={song.id}
              style={on ? { background: `linear-gradient(90deg, rgba(244,244,244,.075) ${songProgress}%, var(--color-subtle) ${songProgress}%)` } : undefined}
              className={`rounded-md border px-2 py-2 transition-colors ${on ? "border-fg shadow-[0_8px_24px_rgba(0,0,0,.2)]" : "border-border bg-bg hover:border-silver"}`}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  aria-current={on ? "true" : undefined}
                  className="mt-1 w-8 shrink-0 text-left font-display text-sm font-semibold text-fg tabular-nums"
                  onClick={() => {
                    const start = songs.slice(0, index).reduce((sum, row) => sum + row.duration, 0);
                    if (engine.playing) engine.playFrom(start, useProject.getState().songs);
                    useProject.setState({ currentTime: start });
                  }}
                >
                  {padIndex(index)}
                </button>
                <div className="min-w-0 flex-1">
                  <input
                    aria-label={`Tên bài ${index + 1}`}
                    value={song.title}
                    onChange={(event) => patchSong(song.id, { title: event.target.value })}
                    className="h-9 w-full rounded-sm bg-transparent px-1 text-sm text-fg outline-none focus:bg-subtle"
                  />
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between gap-1 pl-10">
                <span className="text-xs tabular-nums text-faint">
                  {formatTime(song.duration)}
                  {song.source === "none" ? " · chưa có file" : song.source === "demo" ? " · mẫu" : ""}
                </span>
                <div className="flex">
                  <IconBtn label="Lên" onClick={() => { stopIfPlaying(); moveSong(song.id, -1); }}>
                    <ChevronUp className="size-4" />
                  </IconBtn>
                  <IconBtn label="Xuống" onClick={() => { stopIfPlaying(); moveSong(song.id, 1); }}>
                    <ChevronDown className="size-4" />
                  </IconBtn>
                  <IconBtn
                    label="Xóa"
                    onClick={() => {
                      stopIfPlaying();
                      engine.forget(song.id);
                      void deleteAudio(song.id).catch(() => undefined);
                      void clearImage(albumKey(song.id)).catch(() => undefined);
                      removeSong(song.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </IconBtn>
                </div>
              </div>
            </div>
          );
        })}
        {!songs.length && <p className="px-2 py-6 text-sm text-muted">Chưa có bài. Tải file nhạc hoặc thêm dòng trống.</p>}
      </div>
      <div className="space-y-2 border-t border-border p-3">
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={addBlank}>
            <Plus className="size-4" />
            Dòng trống
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              engine.pause();
              for (const song of useProject.getState().songs) engine.forget(song.id);
              useProject.setState({ playing: false, currentTime: 0 });
              replaceSongs(DEMO_SONGS.map((song) => ({ ...song })));
            }}
          >
            Mẫu
          </Button>
        </div>
        <button type="button" className="text-xs text-muted" onClick={() => setOpen((v) => !v)}>
          {open ? "Đóng dán danh sách" : "Dán danh sách (mỗi dòng một bài)"}
        </button>
        {open && (
          <div className="space-y-2">
            <textarea
              value={bulk}
              onChange={(event) => setBulk(event.target.value)}
              placeholder={"Mưa trên kính - SoraSleep\nĐèn phố khuya - Phòng thu đêm"}
              rows={4}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-silver"
            />
            <Button variant="solid" onClick={addBulk} disabled={!bulk.trim()}>
              Thêm vào list
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-9 place-items-center rounded-md text-muted hover:bg-subtle hover:text-fg">
      {children}
    </button>
  );
}
