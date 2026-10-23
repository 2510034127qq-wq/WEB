import { defineConfig } from "vite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
function publicFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? publicFiles(join(dir, e.name), prefix + e.name + "/")
      : [prefix + e.name],
  );
}
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@dimforge")) return "physics";
          if (id.includes("node_modules/three")) return "three";
        },
      },
    },
  },
  plugins: [
    {
      name: "local-workshop-offline",
      apply: "build",
      generateBundle(_, bundle) {
        const files = publicFiles("public");
        const hash = createHash("sha256");
        for (const file of files)
          hash.update(readFileSync(join("public", file)));
        for (const b of Object.values(bundle))
          hash.update(b.type === "chunk" ? b.code : String(b.source));
        const cache = "yaohuo-" + hash.digest("hex").slice(0, 12),
          urls = [
            ...new Set([
              "/",
              "/index.html",
              ...files.map((f) => "/" + f),
              ...Object.keys(bundle).map((f) => "/" + f),
            ]),
          ];
        const code = `const CACHE=${JSON.stringify(cache)};const URLS=${JSON.stringify(urls)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('yaohuo-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method==='GET'&&u.origin===location.origin&&URLS.includes(u.pathname))e.respondWith(caches.open(CACHE).then(c=>c.match(u.pathname)).then(r=>r||fetch(e.request)));});`;
        this.emitFile({ type: "asset", fileName: "sw.js", source: code });
      },
    },
  ],
});
