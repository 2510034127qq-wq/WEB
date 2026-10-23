import { validateSave, type GameState } from "./model";
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("yaohuo-workshop", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("saves");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function save(state: GameState) {
  const d = await db();
  const snapshot = structuredClone(state);
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction("saves", "readwrite");
    tx.objectStore("saves").put(snapshot, "current");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function restore() {
  const d = await db();
  return new Promise<GameState | null>((resolve, reject) => {
    const r = d.transaction("saves").objectStore("saves").get("current");
    r.onsuccess = () => {
      try {
        resolve(r.result ? validateSave(r.result) : null);
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(r.error);
  });
}
export function download(data: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(data);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
