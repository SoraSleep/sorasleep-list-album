import { useEffect, useState } from "react";
import { Download, Folder, Pause, Play, RectangleHorizontal, RectangleVertical, RefreshCw, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { engine } from "@/lib/engine";
import { isDesktop } from "@/lib/desktop";
import { chooseExportFolder, exportFolderName, exportFolderReady } from "@/lib/export-dir";
import { cancelExport, exportPlaylist } from "@/lib/export-list";
import { formatTime, locate, totalDuration } from "@/lib/playlist";
import { useProject } from "@/lib/store";

export function TopBar() {
  const name = useProject((s) => s.name);
  const aspect = useProject((s) => s.aspect);
  const playing = useProject((s) => s.playing);
  const currentTime = useProject((s) => s.currentTime);
  const songs = useProject((s) => s.songs);
  const exporting = useProject((s) => s.exporting);
  const setName = useProject((s) => s.setName);
  const setAspect = useProject((s) => s.setAspect);
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState("");
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    setDesktop(isDesktop());
    void exportFolderName().then(setFolder).catch(() => undefined);
  }, []);

  const total = totalDuration(songs);
  const place = locate(songs, currentTime);

  async function toggle() {
    try {
      const ctx = engine.ensure();
      if (ctx.state === "suspended") await ctx.resume();
      if (engine.playing) {
        engine.pause();
        useProject.setState({ playing: false, currentTime: engine.now() });
        return;
      }
      const live = useProject.getState();
      await engine.ensureSongs(live.songs);
      let t = live.currentTime;
      const end = totalDuration(live.songs);
      if (t >= end - 0.08) t = 0;
      engine.onEnded = () => {
        useProject.setState({ playing: false, currentTime: engine.now() });
      };
      engine.playFrom(t, live.songs);
      useProject.setState({ playing: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không phát được danh sách");
    }
  }

  async function runExport(limit?: number) {
    if (busy || exporting) return;
    setBusy(true);
    try {
      await exportFolderReady();
      toast.message(limit ? "Đang xuất 20 giây, 1080p…" : "Đang xuất 1080p. File ghi ra đĩa, không giữ cả video trong RAM.");
      const saved = await exportPlaylist(limit);
      if (saved === "cancel") return;
      toast.success(saved === "folder" ? `Đã lưu video vào thư mục ${folder || "đã chọn"}.` : "Đã tải video WebM.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xuất video thất bại");
      useProject.setState({ exporting: false, playing: false });
    } finally {
      setBusy(false);
    }
  }

  async function pickFolder() {
    try {
      const name = await chooseExportFolder();
      setFolder(name);
      toast.success(`Video sẽ lưu vào ${name}.`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(err instanceof Error ? err.message : "Không chọn được thư mục");
    }
  }

  async function updateApp() {
    const api = window.soraDesktop;
    if (!api?.checkUpdate) return;
    const result = await api.checkUpdate();
    if (!result.ok && (result.reason === "private-token" || result.needToken)) {
      const token = window.prompt("Repo riêng. Dán GitHub token (quyền repo). Token chỉ lưu trên máy này.");
      if (token && api.saveUpdateToken) {
        await api.saveUpdateToken(token.trim());
        toast.message("Đã lưu token. Bấm Cập nhật lần nữa.");
      }
      return;
    }
    if (!result.ok) {
      toast.message(result.reason === "dev" ? "Bản dev không kiểm tra cập nhật." : "Không kiểm tra được bản mới.");
      return;
    }
    if (result.latest && result.version && result.latest !== result.version) {
      toast.message(`Có bản ${result.latest}. App sẽ hỏi khi tải xong.`);
      return;
    }
    toast.success(`Đang dùng bản ${result.version ?? ""}.`);
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <div className="hidden items-center gap-2 sm:flex">
        <span className="grid size-8 place-items-center rounded-sm bg-fg font-display text-sm font-semibold text-bg">
          L
        </span>
        <div className="leading-tight">
          <p className="font-display text-sm font-semibold text-fg">SoraSleep List</p>
          <p className="text-xs text-faint">Danh sách chạy</p>
        </div>
      </div>
      <input
        aria-label="Tên file xuất"
        placeholder="Tên file xuất"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="h-11 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-faint focus:border-silver"
      />
      <p className="hidden font-display text-sm tabular-nums text-muted md:block">
        {formatTime(currentTime)} · {formatTime(total)}
        <span className="ml-2 text-accent">{songs.length ? `${place.index + 1}/${songs.length}` : ""}</span>
      </p>
      <Button
        variant={aspect === "wide" ? "solid" : "quiet"}
        className="w-11 px-0"
        aria-label="Khung 16:9"
        onClick={() => setAspect("wide")}
      >
        <RectangleHorizontal className="size-4" />
      </Button>
      <Button
        variant={aspect === "tall" ? "solid" : "quiet"}
        className="w-11 px-0"
        aria-label="Khung 9:16"
        onClick={() => setAspect("tall")}
      >
        <RectangleVertical className="size-4" />
      </Button>
      <Button variant="solid" className="w-11 px-0" data-play aria-label={playing ? "Tạm dừng" : "Phát"} onClick={() => void toggle()} disabled={exporting}>
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      {exporting ? (
        <Button variant="ghost" onClick={() => cancelExport()}>
          <Square className="size-3.5" />
          <span data-export-meter>Hủy 0%</span>
        </Button>
      ) : (
        <>
          <Button variant="quiet" className="max-w-36 px-2" onClick={() => void pickFolder()} title={folder || "Chọn thư mục lưu video"}>
            <Folder className="size-4 shrink-0" />
            <span className="truncate">{folder || "Thư mục"}</span>
          </Button>
          <Button variant="ghost" onClick={() => void runExport(20)} disabled={busy || !songs.length}>
            <Download className="size-4" />
            <span className="hidden sm:inline">20s</span>
          </Button>
          <Button variant="ghost" onClick={() => void runExport()} disabled={busy || !songs.length}>
            <Download className="size-4" />
            <span className="hidden sm:inline">YouTube</span>
          </Button>
          {desktop ? (
            <Button variant="quiet" onClick={() => void updateApp()}>
              <RefreshCw className="size-4" />
              <span className="hidden sm:inline">Cập nhật</span>
            </Button>
          ) : null}
        </>
      )}
    </header>
  );
}
