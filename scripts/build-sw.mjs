import { readdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? files(`${dir}/${e.name}`) : `${dir}/${e.name}`,
      ),
    )
  ).flat();
}
const outDir = process.argv[2] || "dist";
const modelManifest = JSON.parse(
  await readFile(
    new URL("../src/speech/comparison-manifest.json", import.meta.url),
    "utf8",
  ),
);
const recognitionManifest = JSON.parse(
  await readFile(
    new URL("../src/speech/recognition-manifest.json", import.meta.url),
    "utf8",
  ),
);
// GitHub Pages serves this shell for direct browser-route entries. Asset URLs
// already include the configured absolute deployment base.
await copyFile(`${outDir}/index.html`, `${outDir}/404.html`);
const paths = (await files(outDir)).filter((p) => !p.endsWith("sw.js"));
const onDemand = paths.filter((p) =>
  /\/(comparison\.worker-|ort-wasm-)/.test(p),
);
// Required comparison weights have their own verified, scope-specific cache.
const eager = paths.filter(
  (p) => !onDemand.includes(p) && !p.includes("/models/"),
);
const hash = createHash("sha256");
hash.update(await readFile(new URL(import.meta.url)));
for (const p of paths.sort()) hash.update(await readFile(p));
const version = `pte-studio-${hash.digest("hex").slice(0, 12)}`;
await writeFile(
  `${outDir}/sw.js`,
  `const PREFIX="pte-studio:"+self.registration.scope+":";
const CACHE=PREFIX+${JSON.stringify(version)};
const MODEL_CACHE="pte-comparison:"+self.registration.scope+":"+${JSON.stringify(modelManifest.id + ":" + recognitionManifest.id)};
const ASSETS=${JSON.stringify(eager.map((p) => "./" + p.slice(outDir.length + 1)))};
const ON_DEMAND=${JSON.stringify(onDemand.map((p) => "./" + p.slice(outDir.length + 1)))}.map(path=>new URL(path,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
event.respondWith((async()=>{const cache=await caches.open(CACHE);let cached=await cache.match(event.request,{ignoreSearch:true,ignoreVary:true});if(!cached&&ON_DEMAND.includes(url.href))cached=await(await caches.open(MODEL_CACHE)).match(event.request,{ignoreSearch:true,ignoreVary:true});if(!cached&&event.request.mode==='navigate')cached=await cache.match(new URL('./index.html',self.registration.scope));if(cached){const range=event.request.headers.get('range');if(range){const match=/^bytes=(\\d+)-(\\d*)$/.exec(range);if(match){const data=await cached.arrayBuffer();const start=Number(match[1]);const end=match[2]?Math.min(Number(match[2]),data.byteLength-1):data.byteLength-1;if(start> end)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+data.byteLength}});return new Response(data.slice(start,end+1),{status:206,headers:{'Content-Type':cached.headers.get('content-type')||'application/octet-stream','Content-Range':'bytes '+start+'-'+end+'/'+data.byteLength,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});}}return cached;}const response=await fetch(event.request);if(response.ok&&ON_DEMAND.includes(url.href)){try{await cache.put(event.request,response.clone());}catch{}}return response;})());});
`,
);
console.log(
  `Offline bundle: ${eager.length} files, ${onDemand.length} speech assets on demand; ${version}`,
);
