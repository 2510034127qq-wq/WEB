import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
const args = process.argv.slice(2),
  value = (name, def) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : def;
const root = resolve(
    value("--dir", fileURLToPath(new URL("../dist", import.meta.url))),
  ),
  port = Number(value("--port", "5173"));
if (!existsSync(resolve(root, "index.html"))) {
  console.error("未找到发布文件。请先运行 npm run build。");
  process.exit(1);
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webm": "video/webm",
};
const cache = new Map();
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const path = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const info = await stat(path);
    if (!info.isFile()) throw new Error("Not a file");
    // Scan meshes and PBR maps are large. Stream them without retaining both a
    // raw and gzip copy in RAM for the lifetime of the local server.
    const textAsset = [".html", ".js", ".css", ".json", ".gltf", ".svg"].includes(extname(path));
    if (!textAsset || info.size > 1024 * 1024) {
      res.writeHead(200, {
        "Content-Type": types[extname(path)] || "application/octet-stream",
        "Content-Length": info.size,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      if (req.method === "HEAD") res.end();
      else await pipeline(createReadStream(path), res);
      return;
    }
    let entry = cache.get(path);
    if (!entry || entry.mtime !== info.mtimeMs) {
      const buffer = await readFile(path);
      entry = { buffer, gzip: gzipSync(buffer), mtime: info.mtimeMs };
      cache.set(path, entry);
    }
    const compressed = /gzip/.test(req.headers["accept-encoding"] || "");
    const data = compressed ? entry.gzip : entry.buffer;
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      ...(compressed
        ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" }
        : {}),
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res
      .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      .end("没有找到这个文件。");
  }
});
server.on("error", (e) => {
  console.error(
    e.code === "EADDRINUSE"
      ? `端口 ${port} 已被占用，可改用 --port 5174。`
      : e.message,
  );
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`窑火 · 本地工坊\n${url}\n按 Ctrl+C 关闭服务。`);
  if (args.includes("--open")) {
    const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    if (existsSync(chrome))
      spawn(chrome, [url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
    else if (process.platform === "win32")
      spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
  }
});
