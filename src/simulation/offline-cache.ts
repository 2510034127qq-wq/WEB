/** Activate the small app shell before loading the scan/PBR assets. Their actual
 * requests populate the offline cache; no second bulk download competes with play.
 * Cache restrictions must never prevent the online workshop from opening.
 */
export async function prepareOfflineCache() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    const worker = registration.installing || registration.waiting;
    if (
      worker &&
      worker.state !== "activated" &&
      worker.state !== "redundant"
    ) {
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timeout);
          worker.removeEventListener("statechange", changed);
          resolve();
        };
        const changed = () => {
          if (worker.state === "activated" || worker.state === "redundant")
            done();
        };
        const timeout = setTimeout(done, 8000);
        worker.addEventListener("statechange", changed);
        changed();
      });
    }
  } catch {
    /* Browser storage policies can disable offline caching. */
  }
}
