export type UpdateCheck = {
  ok: boolean;
  version?: string;
  latest?: string;
  reason?: string;
  needToken?: boolean;
};

export type SoraDesktop = {
  version?: () => Promise<string>;
  checkUpdate?: () => Promise<UpdateCheck>;
  saveUpdateToken?: (token: string) => Promise<boolean>;
  pickExportFolder?: (currentDir?: string) => Promise<string | null>;
  beginExport?: (name: string, dir: string) => Promise<string>;
  writeExport?: (id: string, position: number, data: Uint8Array) => Promise<void>;
  finishExport?: (id: string) => Promise<void>;
  abortExport?: (id: string) => Promise<void>;
  onUpdate?: (cb: (payload: { state: string; version?: string }) => void) => void;
};

declare global {
  interface Window {
    soraDesktop?: SoraDesktop;
  }
}

export function isDesktop() {
  return typeof window !== "undefined" && Boolean(window.soraDesktop?.beginExport);
}

export function desktopExportWritable(id: string) {
  const api = window.soraDesktop;
  return {
    async write(chunk: unknown) {
      const part = chunk as { position?: number; data?: Uint8Array };
      const data = part?.data instanceof Uint8Array ? part.data : new Uint8Array(chunk as ArrayBuffer);
      await api?.writeExport?.(id, part?.position ?? 0, data);
    },
    async close() {
      await api?.finishExport?.(id);
    },
    async abort() {
      await api?.abortExport?.(id);
    },
  };
}
