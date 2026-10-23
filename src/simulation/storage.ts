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
  const snapshot = structuredClone(state);
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction("saves", "readwrite");
    tx.objectStore("saves").put(snapshot, "current");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("本地存档事务被中断。"));
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
  a.hidden=true;document.body.append(a);
  a.click();
  a.remove();
  // Large GLBs can wait for the browser's file/security handling before reading
  // the blob. Keep it alive beyond the first two seconds; unload also releases it.
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
