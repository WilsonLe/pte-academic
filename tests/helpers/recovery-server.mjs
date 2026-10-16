import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
/** Two releases: a real cached pre-guard broken shell, then the current pack. */
export async function recoveryServer({ port = 0, phase = () => 2 } = {}) {
  const root = resolve("dist");
  const broken =
    '<html><body><script type="module" src="/assets/retired-53.js"></script></body></html>';
  const legacy = `const name='pte-studio:'+self.registration.scope+':pte-studio-broken-53';self.addEventListener('install',e=>e.waitUntil(caches.open(name).then(c=>c.put(new URL('index.html',self.registration.scope),new Response(${JSON.stringify(broken)},{headers:{'Content-Type':'text/html'}})))));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(caches.open(name).then(c=>c.match(new URL('index.html',self.registration.scope))));});`;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost"),
      stage = phase();
    if (url.pathname.includes('/models/')) {res.writeHead(404).end();return;}
    const path = resolve(root, "." + url.pathname);
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      let file =
        path === root || !extname(path) ? resolve(root, "index.html") : path;
      if (stage === 3 && url.pathname === "/sw.js")
        throw Error("Missing worker");
      let data = await readFile(file);
      if (stage === 1 && url.pathname === "/sw.js") data = Buffer.from(legacy);
      if (stage === 3 && file.endsWith("/index.html"))
        data = Buffer.from(
          data
            .toString()
            .replace(
              /(<script[^>]+src=")[^"]+("[^>]*>)/,
              "$1/assets/retired-53.js$2",
            ),
        );
      const mime = {
        ".js": "text/javascript",
        ".html": "text/html",
        ".css": "text/css",
        ".json": "application/json",
        ".mp3": "audio/mpeg",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
        ".wasm": "application/wasm",
        ".png": "image/png",
        ".woff2": "font/woff2",
      };
      res
        .writeHead(200, {
          "Content-Type": mime[extname(file)] || "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r, j) => {server.closeAllConnections();server.close((e) => (e ? j(e) : r()));}),
  };
}
