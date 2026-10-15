#!/usr/bin/env node
/** Synthetic training references only. Shares authoring credentials, lock and ledger. */
import { readFile, writeFile, mkdir, rename, lstat } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  api,
  listModels,
  estimateCost,
  enforceBudget,
  withGenerationLock,
  readLedger,
  writeLedger,
} from "./openrouter.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(ROOT, "training/reference-corpus.json");
const OUTPUT = join(ROOT, "artifacts/pronunciation/reference-v1");
const MANIFEST = join(OUTPUT, "manifest.json");
const hash = (x) => createHash("sha256").update(x).digest("hex");
export function validateCorpus(config) {
  if (
    config.schemaVersion !== 1 ||
    !Array.isArray(config.passages) ||
    config.passages.length < 100 ||
    !Array.isArray(config.voices) ||
    !config.voices.length
  )
    throw Error(
      "Corpus needs at least 100 original passages and explicit voices.",
    );
  if (
    new Set(config.passages.map((p) => p.id)).size !== config.passages.length ||
    new Set(config.passages.map((p) => p.text)).size !== config.passages.length
  )
    throw Error("Duplicate passage IDs or texts.");
  for (const p of config.passages)
    if (
      !/^[a-z0-9-]+$/.test(p.id) ||
      typeof p.text !== "string" ||
      p.text.length < 40 ||
      p.text.length > 1500
    )
      throw Error("Invalid passage.");
  for (const v of config.voices)
    if (!/^[a-z0-9_]+$/.test(v)) throw Error("Invalid voice.");
  return config.passages.flatMap((p) =>
    config.voices.map((voice) => ({
      ...p,
      voice,
      takeId: `${p.id}--${voice}`,
    })),
  );
}
async function atomic(path, data) {
  const tmp = path + "." + randomBytes(8).toString("hex") + ".tmp";
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  await rename(tmp, path);
}
export function checkKeyBudget(key, limit, cost, reserved) {
  if (
    !Number.isFinite(key?.usage) ||
    !Number.isFinite(key?.limit) ||
    key.limit > limit ||
    key.limit_reset
  )
    throw Error("Provider total budget guard is not valid.");
  enforceBudget(
    cost,
    Math.min(limit, key.limit),
    Math.max(reserved, key.usage),
  );
  if (Number.isFinite(key.limit_remaining) && cost > key.limit_remaining + 1e-9)
    throw Error("Provider remaining credit is insufficient.");
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const config = JSON.parse(await readFile(CONFIG, "utf8"));
  const takes = validateCorpus(config);
  const model = (await listModels()).find((m) => m.id === config.model);
  if (!model || config.voices.some((v) => !model.supported_voices?.includes(v)))
    throw Error("Configured model or voice is unavailable.");
  const estimate = estimateCost(
    takes.map((t) => t.text),
    model,
  );
  if (command === "plan") {
    console.log(
      JSON.stringify(
        {
          model: config.model,
          voices: config.voices,
          passages: config.passages.length,
          recordings: takes.length,
          estimatedInputCostUsd: estimate,
          output: OUTPUT,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command !== "generate")
    throw Error(
      "Usage: node scripts/reference-corpus.mjs plan | generate --confirm-spend --max-usd NUMBER",
    );
  const cap = Number(args[args.indexOf("--max-usd") + 1]);
  if (
    !args.includes("--confirm-spend") ||
    !Number.isFinite(cap) ||
    cap <= 0 ||
    estimate > cap
  )
    throw Error("Review plan and supply a sufficient positive batch ceiling.");
  // Prove inspector availability before the first paid request.
  execFileSync(
    "/usr/bin/afinfo",
    [join(ROOT, "public/audio/repeat-sentence-01.mp3")],
    { stdio: "ignore" },
  );
  await withGenerationLock(async () => {
    await mkdir(OUTPUT, { recursive: true });
    // Never write through a symlink at any output component.
    for (let p = OUTPUT; p !== ROOT; p = dirname(p))
      if ((await lstat(p)).isSymbolicLink())
        throw Error("Unsafe corpus output directory.");
    const policy = JSON.parse(
      await readFile(join(ROOT, "content/authoring.json"), "utf8"),
    );
    if (
      policy.spendingLimitUsd !== 10 ||
      !policy.requiresOperatorApprovalToIncrease
    )
      throw Error("Original project spending policy is required.");
    const ledger = await readLedger();
    if (ledger.reservations.some((r) => r.status !== "completed"))
      throw Error(
        "An uncertain existing paid request requires reconciliation before generation.",
      );
    let manifest;
    try {
      manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      manifest = {
        schemaVersion: 1,
        referenceVersion: config.referenceVersion,
        model: config.model,
        synthetic: true,
        takes: [],
      };
    }
    const pending = takes.filter(
      (t) => !manifest.takes.some((m) => m.takeId === t.takeId),
    );
    checkKeyBudget(
      (await (await api("/key")).json()).data,
      10,
      estimateCost(
        pending.map((t) => t.text),
        model,
      ),
      ledger.reservations.reduce((s, r) => s + r.costUsd, 0),
    );
    for (const take of takes) {
      const path = join(OUTPUT, take.takeId + ".mp3");
      const previous = manifest.takes.find((t) => t.takeId === take.takeId);
      if (previous) {
        if (
          previous.scriptSha256 !== hash(take.text) ||
          previous.model !== model.id ||
          previous.voice !== take.voice ||
          hash(await readFile(path)) !== previous.audioSha256
        )
          throw Error(
            "Existing take does not match request or hash; preserved.",
          );
        continue;
      }
      try {
        await lstat(path);
        throw Error("Unmanifested audio exists; reconcile before continuing.");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const cost = estimateCost([take.text], model);
      checkKeyBudget(
        (await (await api("/key")).json()).data,
        10,
        cost,
        ledger.reservations.reduce((s, r) => s + r.costUsd, 0),
      );
      const reservation = {
        questionId: `reference-v1/${take.takeId}`,
        model: model.id,
        costUsd: cost,
        status: "reserved",
        at: new Date().toISOString(),
      };
      ledger.reservations.push(reservation);
      await writeLedger(ledger);
      const response = await api("/audio/speech", {
        method: "POST",
        body: JSON.stringify({
          model: model.id,
          input: take.text,
          voice: take.voice,
          response_format: "mp3",
        }),
      });
      const generationId = response.headers.get("x-generation-id");
      reservation.generationId = generationId;
      await writeLedger(ledger);
      if (!(response.headers.get("content-type") || "").startsWith("audio/"))
        throw Error("Expected audio; paid reservation retained.");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 128 || bytes.length > 20 * 1024 * 1024)
        throw Error("Invalid audio size; reservation retained.");
      const tmp = path + ".pending";
      await writeFile(tmp, bytes, { flag: "wx", mode: 0o600 });
      const info = execFileSync("/usr/bin/afinfo", [tmp], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const duration = Number(
        /estimated duration:\s*([0-9.]+)\s*sec/i.exec(info)?.[1],
      );
      if (!Number.isFinite(duration) || duration < 1 || duration > 90)
        throw Error(
          "Unexpected audio duration; pending artifact and reservation preserved.",
        );
      await rename(tmp, path);
      manifest.takes.push({
        ...take,
        file: take.takeId + ".mp3",
        model: model.id,
        synthetic: true,
        language: "en-US",
        scriptSha256: hash(take.text),
        audioSha256: hash(bytes),
        durationSeconds: duration,
        generationId,
        estimatedInputCostUsd: cost,
        listeningStatus: "pending human listening review",
      });
      await atomic(MANIFEST, manifest);
      reservation.status = "completed";
      await writeLedger(ledger);
      console.log(
        `${manifest.takes.length}/${takes.length} ${take.takeId} ${duration.toFixed(2)}s`,
      );
    }
    console.log(
      JSON.stringify({
        completed: manifest.takes.length,
        seconds: manifest.takes.reduce((s, t) => s + t.durationSeconds, 0),
        estimatedInputCostUsd: estimate,
        manifest: MANIFEST,
      }),
    );
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
