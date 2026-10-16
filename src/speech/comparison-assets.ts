import manifest from "./comparison-manifest.json";
export { manifest as comparisonManifest };
export type ModelProgress = {
  status: "loading" | "ready" | "error";
  message: string;
  percent: number;
};
const listeners = new Set<() => void>();
let state: ModelProgress = {
  status: "loading",
  message: "Preparing required speech model…",
  percent: 0,
};
let pending: Promise<void> | undefined;
const update = (next: ModelProgress) => {
  state = next;
  listeners.forEach((f) => f());
};
export const modelStatus = () => state;
export const subscribeModel = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function modelBase() {
  return new URL(import.meta.env.BASE_URL, globalThis.location.origin).href;
}
export function modelCache(base = modelBase()) {
  return `pte-comparison:${base}:${manifest.id}`;
}
export async function verifiedAsset(path: string, base = modelBase()) {
  const descriptor = manifest.files.find((f) => f.path === path);
  if (!descriptor) throw new Error("Unknown speech model asset.");
  const cache = await caches.open(modelCache(base));
  const response = await cache.match(
    new URL(manifest.assetDirectory + path, base).href,
  );
  if (!response)
    throw new Error("Required speech model is missing. Retry its download.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.length !== descriptor.bytes ||
    (await sha256(bytes)) !== descriptor.sha256
  )
    throw new Error("Speech model integrity check failed. Retry its download.");
  return bytes;
}
async function sha256(data: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function prepareComparisonModel(
  retry = false,
  runtimeFiles: string[] = [],
): Promise<void> {
  if (retry && state.status !== "loading") pending = undefined;
  if (pending) return pending;
  pending = (async () => {
    if (typeof caches === "undefined" || !globalThis.crypto?.subtle)
      throw new Error(
        "This browser cannot store the required speech model. Use a supported browser with storage available.",
      );
    const base = modelBase(),
      cache = await caches.open(modelCache(base));
    let complete = 0,
      index = 0;
    const active = new Map<string, number>();
    const progress = () => {
      const loaded = complete + [...active.values()].reduce((a, b) => a + b, 0);
      update({
        status: "loading",
        percent: Math.floor((loaded / manifest.totalBytes) * 100),
        message: `Preparing required speech model · ${Math.floor((loaded / manifest.totalBytes) * 100)}% of ${Math.ceil(manifest.totalBytes / 1024 / 1024)} MB`,
      });
    };
    update({
      status: "loading",
      percent: 0,
      message: "Preparing required speech model…",
    });
    // Bounded parallel downloads avoid buffering the whole encoder in the page.
    let failed: Error | undefined;
    async function next() {
      while (index < manifest.files.length && !failed) {
        const file = manifest.files[index++],
          url = new URL(manifest.assetDirectory + file.path, base).href;
        try {
          const cached = await cache.match(url);
          let bytes: Uint8Array | undefined;
          if (cached) {
            const data = new Uint8Array(await cached.arrayBuffer());
            if (
              data.length === file.bytes &&
              (await sha256(data)) === file.sha256
            )
              bytes = data;
            else await cache.delete(url);
          }
          if (!bytes) {
            const response = await fetch(url, {
              cache: "no-store",
              signal: AbortSignal.timeout(180_000),
            });
            if (!response.ok)
              throw new Error(
                "Required speech model download failed. Check your connection and retry.",
              );
            const data = new Uint8Array(file.bytes);
            const reader = response.body?.getReader();
            if (!reader)
              throw new Error("Model download streaming is unavailable.");
            let offset = 0;
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (offset + value.length > data.length)
                  throw new Error("Unexpected model download size.");
                data.set(value, offset);
                offset += value.length;
                active.set(file.path, offset);
                progress();
              }
            } finally {
              reader.releaseLock();
            }
            if (offset !== file.bytes || (await sha256(data)) !== file.sha256)
              throw new Error(
                "Downloaded model failed its integrity check. Retry the download.",
              );
            await cache.put(
              url,
              new Response(data, {
                headers: {
                  "Content-Type": "application/octet-stream",
                  "Content-Length": String(data.length),
                },
              }),
            );
            bytes = data;
          }
          active.delete(file.path);
          complete += bytes.length;
          progress();
        } catch (e) {
          failed =
            e instanceof Error
              ? e
              : new Error(
                  "Required speech model could not be stored. Free browser storage and retry.",
                );
        }
      }
    }
    await Promise.all([next(), next()]);
    if (failed) throw failed;
    for (const file of runtimeFiles) {
      const url = new URL(file, base).href;
      if (!url.startsWith(base))
        throw new Error("Unexpected speech runtime path.");
      if (!(await cache.match(url))) {
        update({
          status: "loading",
          percent: 99,
          message: "Preparing required speech runtime…",
        });
        const response = await fetch(url, {
          signal: AbortSignal.timeout(180_000),
        });
        if (!response.ok)
          throw new Error(
            "Required speech runtime download failed. Retry the model download.",
          );
        await cache.put(url, response);
      }
    }
    update({ status: "ready", percent: 100, message: "Speech model ready" });
  })().catch((e) => {
    update({
      status: "error",
      percent: 0,
      message:
        e instanceof Error
          ? e.message
          : "Required speech model preparation failed.",
    });
    throw e;
  });
  // App startup observes errors through the shared status and keeps retry available.
  pending.catch(() => {});
  return pending;
}
