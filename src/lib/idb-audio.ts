export function peakKey(id: string) {
  return `peaks:${id}`;
}

const DB = "sorasleep-list";
const AUDIO = "audio";
const IMAGES = "images";
const HANDLES = "handles";

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUDIO)) db.createObjectStore(AUDIO);
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES);
      if (!db.objectStoreNames.contains(HANDLES)) db.createObjectStore(HANDLES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAudio(id: string, data: ArrayBuffer) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AUDIO, "readwrite");
    tx.objectStore(AUDIO).put(data, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadAudio(id: string) {
  const db = await openDb();
  const data = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
    const tx = db.transaction(AUDIO, "readonly");
    const req = tx.objectStore(AUDIO).get(id);
    req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return data;
}

export async function deleteAudio(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AUDIO, "readwrite");
    tx.objectStore(AUDIO).delete(id);
    tx.objectStore(AUDIO).delete(peakKey(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function saveImage(id: string, data: Blob) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IMAGES, "readwrite");
    tx.objectStore(IMAGES).put(data, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadImage(id: string) {
  const db = await openDb();
  const data = await new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction(IMAGES, "readonly");
    const req = tx.objectStore(IMAGES).get(id);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return data;
}

export async function deleteImage(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IMAGES, "readwrite");
    tx.objectStore(IMAGES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function saveHandle(id: string, handle: unknown) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLES, "readwrite");
    tx.objectStore(HANDLES).put(handle, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadHandle(id: string) {
  const db = await openDb();
  const handle = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(HANDLES, "readonly");
    const req = tx.objectStore(HANDLES).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handle;
}
