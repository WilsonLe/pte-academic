import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, access, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
const directory = process.env.PTE_STATIC_DIR || "dist";
const base =
  process.env.BASE_PATH ||
  (directory === "dist-subpath" ? "/pte-academic/" : "/");
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((entry) =>
        entry.isDirectory()
          ? files(join(dir, entry.name))
          : join(dir, entry.name),
      ),
    )
  ).flat();
}
test("published JavaScript stays within the default 500 kB chunk budget", async () => {
  for (const file of (await files(directory)).filter((p) =>
    /\.m?js$/.test(p),
  )) {
    const { size } = await stat(file);
    assert.ok(
      size < 500_000,
      `${file}: ${size} bytes exceeds the chunk budget`,
    );
  }
});
test("published artifact contains a base-aware SPA shell, public assets and scoped offline worker", async () => {
  const shell = await readFile(`${directory}/index.html`, "utf8");
  assert.match(
    shell,
    /name="viewport"[^>]*content="[^"]*minimum-scale=1\.0,maximum-scale=1\.0,user-scalable=no/,
  );
  assert.equal(await readFile(`${directory}/404.html`, "utf8"), shell);
  for (const file of ["manifest.webmanifest", "icon.svg", "icon-192.png"])
    assert.ok(shell.includes(`href="${base}${file}"`));
  for (const [, url] of shell.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(url.startsWith(base), `Unexpected shell asset: ${url}`);
    await access(resolve(directory, url.slice(base.length)));
  }
  assert.ok(!shell.includes("pte-studio-history-v1"));
  const output = await files(directory);
  assert.ok(
    !output.some((path) =>
      /(?:^|\/)(server|\.cli|\.tanstack)(?:\/|$)/.test(path),
    ),
  );
  assert.ok(!output.some((path) => /devtools/i.test(path)));
  const js = (
    await Promise.all(
      output
        .filter((file) => file.endsWith(".js"))
        .map((file) => readFile(file, "utf8")),
    )
  ).join("\n");
  assert.ok(!js.includes("TanStackRouterDevtools"));
  assert.ok(!js.includes("ReactQueryDevtools"));
  const worker = await readFile(`${directory}/sw.js`, "utf8");
  assert.ok(worker.includes("self.registration.scope"));
  const assets = JSON.parse(worker.match(/const ASSETS=(\[.*?\]);/)[1]);
  const onDemand = JSON.parse(
    worker.match(/const ON_DEMAND=(\[.*?\])\.map/)[1],
  );
  assert.ok(assets.includes("./index.html"));
  assert.ok(
    !assets.some((path) =>
      /speech\.worker-|comparison\.worker-|ort-wasm-/.test(path),
    ),
  );
  assert.ok(
    !assets.some((path) => path.includes("/models/")),
    "required model pack must use its separate verified cache",
  );
  assert.ok(
    assets.some((path) => path.includes("_workspace-")),
    "lazy workspace must be available offline before its first use",
  );
  for (const file of output.filter((p) =>
    /\/(speech\.worker-|comparison\.worker-|ort-wasm-)/.test(p),
  )) {
    assert.ok(onDemand.includes(`./${file.slice(directory.length + 1)}`));
  }
  assert.equal(
    output.filter((p) => p.endsWith(".wasm")).length,
    1,
    "only the explicitly pinned speech WASM binary should be published",
  );
});
