import { defineConfig } from "vite";
import { readdirSync, readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
const delivery = JSON.parse(readFileSync("scripts/asset-delivery.json", "utf8"));
const isRuntimeAsset = (file: string) =>
  !delivery.runtimeExcludePrefixes.some((prefix: string) => file.startsWith(prefix)) &&
  !delivery.runtimeExcludeSuffixes.some((suffix: string) => file.endsWith(suffix));
function publicFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? publicFiles(join(dir, e.name), prefix + e.name + "/")
      : [prefix + e.name],
  );
}
export default defineConfig({
  build: {
    copyPublicDir: false,
    rollupOptions: {
      input: { workshop: 'index.html', hands: 'hand-lab.html' },
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
        const files = publicFiles("public").filter(isRuntimeAsset);
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
        // Two download workers bound memory while retaining complete offline assets.
        // Source candidates and intermediate bakes never enter this list.
        const code = `const CACHE=${JSON.stringify(cache)};const URLS=${JSON.stringify(urls)};async function prepare(){const c=await caches.open(CACHE);let i=0;async function worker(){while(i<URLS.length){const u=URLS[i++];if(!await c.match(u))await c.add(u);}}await Promise.all([worker(),worker()]);await self.skipWaiting();}self.addEventListener('install',e=>e.waitUntil(prepare()));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('yaohuo-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method==='GET'&&u.origin===location.origin&&URLS.includes(u.pathname))e.respondWith(caches.open(CACHE).then(c=>c.match(u.pathname)).then(r=>r||fetch(e.request)));});`;
        this.emitFile({ type: "asset", fileName: "sw.js", source: code });
      },
      writeBundle(options) {
        for (const file of publicFiles("public").filter(isRuntimeAsset)) {
          const destination = join(options.dir || "dist", file);
          mkdirSync(dirname(destination), { recursive: true });
          copyFileSync(join("public", file), destination);
        }
      },
    },
  ],
});
