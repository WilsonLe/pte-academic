export type AssetTransport = {
  path: string;
  encoding: "gzip" | "gzip-shuffle2";
  bytes: number;
  sha256: string;
};

/** A bounded, lossless transport. Model bytes are verified again after decoding. */
export async function unpackAsset(
  input: Uint8Array,
  size: number,
  encoding: AssetTransport["encoding"],
) {
  if (typeof DecompressionStream === "undefined")
    throw new Error(
      "This browser cannot unpack the speech model. Use an updated browser.",
    );
  const stream = new Blob([input as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const bytes = new Uint8Array(size);
  let at = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (at + value.length > size) {
        await reader.cancel();
        throw new Error("Unexpected unpacked speech model size.");
      }
      bytes.set(value, at);
      at += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  if (at !== size) throw new Error("Incomplete unpacked speech model.");
  if (encoding === "gzip") return bytes;
  const result = new Uint8Array(size);
  const half = Math.ceil(size / 2);
  for (let i = 0; i < half; i++) {
    result[i * 2] = bytes[i];
    if (i * 2 + 1 < size) result[i * 2 + 1] = bytes[half + i];
  }
  return result;
}
