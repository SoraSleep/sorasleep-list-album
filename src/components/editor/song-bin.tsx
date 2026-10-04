import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { engine } from "@/lib/engine";
import { deleteAudio, saveAudio } from "@/lib/idb-audio";
import { DEMO_SONGS, formatTime, locate, padIndex, parseLines, titleFromFile } from "@/lib/playlist";
import { makeSong, useProject } from "@/lib/store";

export function SongBin() {
  const songs = useProject((s) => s.songs);
  const currentTime = useProject((s) => s.currentTime);
  const patchSong = useProject((s) => s.patchSong);
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
    const ctx = engine.ensure();
    const start = useProject.getState().songs.length;
    const next = [];
    for (const file of Array.from(files)) {
      try {
        const raw = await file.arrayBuffer();
        const buffer = await ctx.decodeAudioData(raw.slice(0));
        const song = makeSong(start + next.length, {
          title: titleFromFile(file.name),
          artist: "",
          duration: buffer.duration,
          source: "file",
        });
        engine.remember(song.id, raw);
        engine.setBuffer(song.id, buffer);
        void saveAudio(song.id, raw).catch(() => undefined);
        next.push(song);
      } catch {
        toast.error(`Không đọc được ${file.name}`);
      }
    }
    if (next.length) {
      stopIfPlaying();
      addSongs(next);
      toast.success(`Đã thêm ${next.length} bài`);
    }
  }

  function addBlank() {
    const count = useProject.getState().songs.length;
    addSongs([makeSong(count, { title: `Bài ${count + 1}`, artist: "", source: "none", duration: 15 })]);
  }

  function addBulk() {
    const rows = parseLines(bulk);
    if (!rows.length) return;
    const count = useProject.getState().songs.length;
    addSongs(rows.map((row, index) => makeSong(count + index, { ...row, source: "none", duration: 15 })));
    setBulk("");
    setOpen(false);
  }

  const place = locate(songs, currentTime);

  return (
    <aside className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="font-display text-sm font-semibold">Bài hát</p>
          <p className="text-xs text-faint">{songs.length} bài · đánh số theo thứ tự</p>
        </div>
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg">
          <Upload className="size-4" />
          Tải nhạc
          <input
            type="file"
            accept="audio/*"
            multiple
            className="sr-only"
            onChange={(event) => {
              void onFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {songs.map((song, index) => {
          const on = index === place.index;
          return (
            <div
              key={song.id}
              className={`rounded-md border px-2 py-2 ${on ? "border-accent bg-subtle" : "border-border bg-bg"}`}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  className="mt-1 w-8 shrink-0 text-left font-display text-sm font-semibold text-accent tabular-nums"
                  onClick={() => {
                    const start = songs.slice(0, index).reduce((sum, row) => sum + row.duration, 0);
                    if (engine.playing) engine.playFrom(start, useProject.getState().songs);
                    useProject.setState({ currentTime: start });
                  }}
                >
                  {padIndex(index)}
                </button>
                <div className="min-w-0 flex-1 space-y-1">
                  <input
                    aria-label={`Tên bài ${index + 1}`}
                    value={song.title}
                    onChange={(event) => patchSong(song.id, { title: event.target.value })}
                    className="h-9 w-full rounded-sm bg-transparent px-1 text-sm text-fg outline-none focus:bg-subtle"
                  />
                  <input
                    aria-label={`Nghệ sĩ bài ${index + 1}`}
                    value={song.artist}
                    placeholder="Nghệ sĩ"
                    onChange={(event) => patchSong(song.id, { artist: event.target.value })}
                    className="h-8 w-full rounded-sm bg-transparent px-1 text-xs text-muted outline-none placeholder:text-faint focus:bg-subtle"
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
