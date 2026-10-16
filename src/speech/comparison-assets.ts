import manifest from "./comparison-manifest.json";
import recognition from "./recognition-manifest.json";
import { unpackAsset, type AssetTransport } from "./asset-codec";
type ModelFile = {
  path: string;
  bytes: number;
  sha256: string;
  transport?: Omit<AssetTransport, "encoding"> & { encoding: string };
};
type ModelPack = { assetDirectory: string; files: ModelFile[] };
const packs: ModelPack[] = [manifest, recognition];
const totalBytes = packs.reduce(
  (n, pack) =>
    n + pack.files.reduce((sum, f) => sum + (f.transport?.bytes ?? f.bytes), 0),
  0,
);
const files = packs.flatMap((pack) =>
  pack.files.map((file) => ({ ...file, url: pack.assetDirectory + file.path })),
);
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
  return `pte-comparison:${base}:${manifest.id}:${recognition.id}`;
}
export class ModelAssetError extends Error {}
export function invalidateComparisonModel(message: string) {
  pending = undefined;
  update({ status: "error", percent: 0, message });
}
export async function verifiedAsset(
  path: string,
  base = modelBase(),
  pack: ModelPack = manifest,
) {
  const descriptor = pack.files.find((f) => f.path === path);
  if (!descriptor) throw new Error("Unknown speech model asset.");
  const cache = await caches.open(modelCache(base));
  const response = await cache.match(
    new URL(pack.assetDirectory + path, base).href,
  );
  if (!response)
    throw new ModelAssetError(
      "Required speech model is missing. Retry its download.",
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.length !== descriptor.bytes ||
    (await sha256(bytes)) !== descriptor.sha256
  ) {
    await cache.delete(new URL(pack.assetDirectory + path, base).href);
    throw new ModelAssetError("Speech model integrity check failed. Retry its download.");
  }
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
// Reference playback and the full preparer share a bounded per-file download.
// Cache entries contain decoded bytes, retaining compatibility with existing packs.
const downloads = new Map<string, Promise<Uint8Array>>();
async function ensureAsset(
  file: ModelFile,
  pack: ModelPack,
  base: string,
  progress: (loaded: number) => void = () => {},
) {
  const url = new URL(pack.assetDirectory + file.path, base).href;
  const cache = await caches.open(modelCache(base));
  const existing = await cache.match(url);
  if (existing) {
    const bytes = new Uint8Array(await existing.arrayBuffer());
    if (bytes.length === file.bytes && (await sha256(bytes)) === file.sha256) {
      if (existing.headers.get("x-pte-sha256") !== file.sha256)
        await cache.put(url, stored(bytes, file));
      return bytes;
    }
    await cache.delete(url);
  }
  const current = downloads.get(url);
  if (current) return current;
  const operation = (async () => {
    const transport = file.transport;
    const expected = transport ?? file;
    const response = await fetch(
      new URL(pack.assetDirectory + expected.path, base),
      {
        cache: "no-store",
        signal: AbortSignal.timeout(180_000),
      },
    );
    if (!response.ok)
      throw new ModelAssetError(
        "Required speech model download failed. Check your connection and retry.",
      );
    const reader = response.body?.getReader();
    if (!reader)
      throw new ModelAssetError("Model download streaming is unavailable.");
    const data = new Uint8Array(expected.bytes);
    let offset = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (offset + value.length > data.length) {
          await reader.cancel();
          throw new ModelAssetError("Unexpected model download size.");
        }
        data.set(value, offset);
        offset += value.length;
        progress(offset);
      }
    } finally {
      reader.releaseLock();
    }
    if (offset !== expected.bytes || (await sha256(data)) !== expected.sha256)
      throw new ModelAssetError(
        "Downloaded model failed its integrity check. Retry the download.",
      );
    const bytes = transport
      ? await unpackAsset(
          data,
          file.bytes,
          transport.encoding as AssetTransport["encoding"],
        )
      : data;
    if (bytes.length !== file.bytes || (await sha256(bytes)) !== file.sha256)
      throw new ModelAssetError(
        "Unpacked model failed its integrity check. Retry the download.",
      );
    await cache.put(url, stored(bytes, file));
    return bytes;
  })();
  downloads.set(url, operation);
  try {
    return await operation;
  } finally {
    downloads.delete(url);
  }
}
function stored(bytes: Uint8Array, file: ModelFile) {
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(file.bytes),
      "x-pte-sha256": file.sha256,
    },
  });
}
/** Only the small reference index/audio can prepare independently of inference. */
export function verifiedReferenceAsset(path: string, base = modelBase()) {
  const file = recognition.files.find((f) => f.path === path);
  if (
    !file ||
    !(
      path === "word-references.json" ||
      /^word-reference-[a-zA-Z-]+\.mp3$/.test(path)
    )
  )
    throw new ModelAssetError("Unknown word reference asset.");
  return ensureAsset(file, recognition, base);
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
      const percent = Math.min(
        99,
        Math.floor(
          ((complete + [...active.values()].reduce((a, b) => a + b, 0)) /
            totalBytes) *
            100,
        ),
      );
      update({
        status: "loading",
        percent,
        message: `Preparing required speech model · ${percent}% of ${Math.ceil(totalBytes / 1024 / 1024)} MB`,
      });
    };
    update({
      status: "loading",
      percent: 0,
      message: "Preparing required speech model…",
    });
    let failed: Error | undefined;
    async function next() {
      while (index < files.length && !failed) {
        const file = files[index++];
        const pack = packs.find(
          (p) => file.url === p.assetDirectory + file.path,
        )!;
        try {
          const cached = await cache.match(new URL(file.url, base).href);
          // Warm availability checks only read validation receipts. Every actual
          // inference/reference read still hashes the decoded bytes in full.
          const warm =
            cached?.headers.get("x-pte-sha256") === file.sha256 &&
            cached.headers.get("content-length") === String(file.bytes);
          if (!warm)
            await ensureAsset(file, pack, base, (n) => {
              active.set(file.url, n);
              progress();
            });
          active.delete(file.url);
          complete += file.transport?.bytes ?? file.bytes;
          progress();
        } catch (e) {
          failed =
            e instanceof Error
              ? e
              : new Error(
                  "Speech model could not be stored. Free browser storage and retry.",
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

export const verifiedRecognitionAsset = (path: string, base = modelBase()) =>
  verifiedAsset(path, base, recognition);
