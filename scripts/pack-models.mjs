import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const selfHash = sha(await readFile(new URL(import.meta.url)));
for (const name of ["comparison", "recognition"]) {
  const manifestPath = `src/speech/${name}-manifest.json`;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const directory = `public/${manifest.assetDirectory}`;
  for (const file of manifest.files) {
    if (file.bytes < 16000 || !/\.(?:bin|json)$/.test(file.path)) continue;
    let raw = await readFile(directory + (file.transport?.path || file.path));
    if (file.transport) {
      const data = gunzipSync(raw);
      if (file.transport.encoding === "gzip-shuffle2") {
        raw = Buffer.alloc(data.length);
        const half = Math.ceil(data.length / 2);
        for (let i = 0; i < half; i++) {
          raw[i * 2] = data[i];
          if (i * 2 + 1 < data.length) raw[i * 2 + 1] = data[half + i];
        }
      } else raw = data;
    }
    if (raw.length !== file.bytes || sha(raw) !== file.sha256)
      throw new Error(`Source model integrity mismatch: ${file.path}`);
    const binary = file.path.endsWith(".bin");
    let input = raw;
    if (binary) {
      input = Buffer.alloc(raw.length);
      const half = Math.ceil(raw.length / 2);
      for (let i = 0; i < half; i++) {
        input[i] = raw[i * 2];
        if (i * 2 + 1 < raw.length) input[half + i] = raw[i * 2 + 1];
      }
    }
    const packed = gzipSync(input, {level: 6});
    const path = binary ? file.path : file.path + ".packed";
    await writeFile(directory + path, packed);
    file.transport = {path, encoding: binary ? "gzip-shuffle2" : "gzip", bytes: packed.length, sha256: sha(packed)};
  }
  manifest.totalDownloadBytes = manifest.files.reduce((n, f) => n + (f.transport?.bytes || f.bytes), 0);
  manifest.transportPackerSha256 = selfHash;
  const json = JSON.stringify(manifest, null, 2) + "\n";
  await writeFile(manifestPath, json);
  await writeFile(directory + "manifest.json", json);
  console.log(`${name}: ${manifest.totalBytes} decoded bytes; ${manifest.totalDownloadBytes} transfer bytes`);
}
