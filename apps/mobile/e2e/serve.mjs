import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, "..", "web-dist"));
const PORT = Number(process.argv[3] || 4173);

const mimeMap = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".map": "application/json",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let fp = path.join(ROOT, url === "/" ? "/index.html" : url);
  if (!fp.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    // SPA fallback so client-side routes still resolve.
    fp = path.join(ROOT, "index.html");
  }
  res.writeHead(200, {
    "Content-Type": mimeMap[path.extname(fp)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(fp).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}`);
});
