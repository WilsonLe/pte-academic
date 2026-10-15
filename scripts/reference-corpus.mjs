#!/usr/bin/env node
/** Versioned synthetic corpora with a single budget/manifest coordinator. */
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  lstat,
  copyFile,
} from "node:fs/promises";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  api,
  listModels,
  estimateCost,
  enforceBudget,
  withGenerationLock,
  readLedger,
  writeLedger,
} from "./openrouter.mjs";
const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = (x) => createHash("sha256").update(x).digest("hex");
export function validateCorpus(config) {
  if (
    ![1, 2].includes(config.schemaVersion) ||
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
  if (config.schemaVersion === 2) {
    const families = new Map();
    for (const p of config.passages) {
      if (
        !/^[a-z0-9-]+$/.test(p.familyId) ||
        !["train", "validation", "test"].includes(p.split)
      )
        throw Error("Expanded passages need explicit family and split.");
      if (families.has(p.familyId) && families.get(p.familyId) !== p.split)
        throw Error("A passage family crosses data splits.");
      families.set(p.familyId, p.split);
    }
  }
  const profiles = config.voices.map((v) =>
    typeof v === "string"
      ? {
          key: v,
          voice: v,
          model: config.model,
          accent: "en-US",
          heldOut: v === config.heldOutVoice,
        }
      : v,
  );
  if (new Set(profiles.map((v) => v.key)).size !== profiles.length)
    throw Error("Duplicate voice keys.");
  for (const v of profiles)
    if (
      !/^[a-z0-9_-]+$/.test(v.key) ||
      typeof v.voice !== "string" ||
      typeof v.model !== "string" ||
      !/^en-(US|GB|AU|IN)$/.test(v.accent)
    )
      throw Error("Invalid voice profile.");
  return config.passages.flatMap((p) =>
    profiles.map((v) => ({
      ...p,
      voice: v.voice,
      voiceKey: v.key,
      model: v.model,
      accent: v.accent,
      heldOut: !!v.heldOut,
      takeId: `${p.id}--${v.key}`,
    })),
  );
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
export function serialCoordinator() {
  let tail = Promise.resolve();
  return (task) => {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  };
}
export async function runWorkerPool(items, concurrency, worker) {
  let cursor = 0,
    stopped = false;
  const failures = [];
  const stoppedNow = () => stopped;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (!stopped && cursor < items.length) {
        const item = items[cursor++];
        try {
          await worker(item, stoppedNow);
        } catch (e) {
          stopped = true;
          failures.push(e);
        }
      }
    }),
  );
  if (failures.length)
    throw Error(
      `${failures.length} worker failure(s); scheduling stopped and in-flight results checkpointed. ${failures[0].message}`,
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
function argument(args, name, fallback) {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const configPath = resolve(
    ROOT,
    argument(args, "--config", "training/reference-corpus.json"),
  );
  if (!configPath.startsWith(ROOT + "/training/"))
    throw Error("Corpus config must be inside training/.");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const takes = validateCorpus(config);
  const directory = config.outputDirectory || "reference-v1";
  if (!/^[a-z0-9-]+$/.test(directory))
    throw Error("Invalid corpus output directory.");
  const output = join(ROOT, "artifacts/pronunciation", directory),
    manifestPath = join(output, "manifest.json");
  const models = new Map((await listModels()).map((m) => [m.id, m]));
  for (const take of takes)
    if (!models.get(take.model)?.supported_voices?.includes(take.voice))
      throw Error("Configured model/voice is unavailable: " + take.voiceKey);
  const costOf = (take) => estimateCost([take.text], models.get(take.model));
  const estimate = takes.reduce((s, t) => s + costOf(t), 0);
  const concurrency = Number(argument(args, "--concurrency", "1"));
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32)
    throw Error("Concurrency must be an integer from 1 to 32.");
  const requestsPerSecond = Number(
    argument(args, "--requests-per-second", "4"),
  );
  if (
    !Number.isFinite(requestsPerSecond) ||
    requestsPerSecond <= 0 ||
    requestsPerSecond > 32
  )
    throw Error(
      "Request starts per second must be greater than 0 and at most 32.",
    );
  if (command === "plan") {
    console.log(
      JSON.stringify(
        {
          referenceVersion: config.referenceVersion,
          passages: config.passages.length,
          recordings: takes.length,
          accents: [...new Set(takes.map((t) => t.accent))],
          estimatedInputCostUsd: estimate,
          concurrency,
          requestsPerSecond,
          output,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command !== "generate")
    throw Error(
      "Usage: node scripts/reference-corpus.mjs plan | generate --config PATH --concurrency N --requests-per-second N --confirm-spend --max-usd NUMBER",
    );
  const cap = Number(argument(args, "--max-usd", NaN));
  if (
    !args.includes("--confirm-spend") ||
    !Number.isFinite(cap) ||
    cap <= 0 ||
    estimate > cap
  )
    throw Error("Review plan and supply a sufficient positive batch ceiling.");
  await exec("/usr/bin/afinfo", [
    join(ROOT, "public/audio/repeat-sentence-01.mp3"),
  ]);
  await withGenerationLock(async () => {
    await mkdir(output, { recursive: true });
    for (let p = output; p !== ROOT; p = dirname(p))
      if ((await lstat(p)).isSymbolicLink())
        throw Error("Unsafe corpus output directory.");
    const policy = JSON.parse(
      await readFile(join(ROOT, "content/authoring.json"), "utf8"),
    );
    if (
      policy.spendingLimitUsd !== 10 ||
      !policy.requiresOperatorApprovalToIncrease
    )
      throw Error("Original spending policy required.");
    const ledger = await readLedger();
    if (ledger.reservations.some((r) => r.status !== "completed"))
      throw Error(
        "An uncertain paid request requires reconciliation before generation.",
      );
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      manifest = {
        schemaVersion: 2,
        referenceVersion: config.referenceVersion,
        configSha256: hash(await readFile(configPath)),
        synthetic: true,
        takes: [],
      };
    }
    if (manifest.referenceVersion !== config.referenceVersion)
      throw Error("Existing corpus version differs.");
    let old = [];
    if (directory !== "reference-v1") {
      try {
        old = JSON.parse(
          await readFile(
            join(ROOT, "artifacts/pronunciation/reference-v1/manifest.json"),
            "utf8",
          ),
        ).takes;
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    manifest.configSha256 = hash(await readFile(configPath));
    const existing = new Map(manifest.takes.map((t) => [t.takeId, t]));
    const pending = [];
    for (const take of takes) {
      const path = join(output, take.takeId + ".mp3"),
        previous = existing.get(take.takeId);
      if (previous) {
        if (
          previous.scriptSha256 !== hash(take.text) ||
          previous.model !== take.model ||
          previous.voice !== take.voice ||
          (config.schemaVersion === 2 &&
            ["accent", "heldOut", "split", "familyId"].some(
              (key) => previous[key] !== take[key],
            )) ||
          hash(await readFile(path)) !== previous.audioSha256
        )
          throw Error("Existing take differs; preserved.");
        continue;
      }
      const reusable = old.find(
        (t) =>
          t.takeId === take.takeId &&
          t.text === take.text &&
          t.model === take.model &&
          t.voice === take.voice,
      );
      if (reusable) {
        const source = join(
          ROOT,
          "artifacts/pronunciation/reference-v1",
          reusable.file,
        );
        if (hash(await readFile(source)) !== reusable.audioSha256)
          throw Error("Reuse hash mismatch.");
        try {
          await copyFile(source, path, 1);
        } catch (e) {
          if (
            e.code !== "EEXIST" ||
            hash(await readFile(path)) !== reusable.audioSha256
          )
            throw e;
        }
        const record = { ...reusable, ...take, reusedFrom: "reference-v1" };
        manifest.takes.push(record);
        existing.set(take.takeId, record);
        continue;
      }
      try {
        await lstat(path);
        throw Error("Unmanifested audio exists; reconcile.");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      pending.push(take);
    }
    await atomic(manifestPath, manifest);
    const remainingCost = pending.reduce((s, t) => s + costOf(t), 0);
    checkKeyBudget(
      (await (await api("/key")).json()).data,
      10,
      remainingCost,
      ledger.reservations.reduce((s, r) => s + r.costUsd, 0),
    );
    const serialize = serialCoordinator();
    const started = Date.now();
    let nextStart = started;
    const pace = async () => {
      const now = Date.now();
      const scheduled = Math.max(now, nextStart);
      nextStart = scheduled + 1000 / requestsPerSecond;
      await new Promise((resolve) => setTimeout(resolve, scheduled - now));
    };
    let generated = 0;
    await runWorkerPool(pending, concurrency, async (take, stopped) => {
      await pace();
      if (stopped()) return;
      const key = (await (await api("/key")).json()).data;
      const reservation = await serialize(async () => {
        if (stopped()) return null;
        const costUsd = costOf(take);
        checkKeyBudget(
          key,
          10,
          costUsd,
          ledger.reservations.reduce((s, r) => s + r.costUsd, 0),
        );
        const record = {
          questionId: `${directory}/${take.takeId}`,
          model: take.model,
          costUsd,
          status: "reserved",
          at: new Date().toISOString(),
        };
        ledger.reservations.push(record);
        await writeLedger(ledger);
        return record;
      });
      if (!reservation) return;
      const response = await api("/audio/speech", {
        method: "POST",
        body: JSON.stringify({
          model: take.model,
          input: take.text,
          voice: take.voice,
          response_format: "mp3",
        }),
      });
      const generationId = response.headers.get("x-generation-id");
      await serialize(async () => {
        reservation.generationId = generationId;
        await writeLedger(ledger);
      });
      if (!(response.headers.get("content-type") || "").startsWith("audio/"))
        throw Error("Expected audio; reservation retained.");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 128 || bytes.length > 20 * 1024 * 1024)
        throw Error("Invalid audio size; reservation retained.");
      const path = join(output, take.takeId + ".mp3"),
        temp = path + ".pending";
      await writeFile(temp, bytes, { flag: "wx", mode: 0o600 });
      const { stdout } = await exec("/usr/bin/afinfo", [temp]);
      const duration = Number(
        /estimated duration:\s*([0-9.]+)\s*sec/i.exec(stdout)?.[1],
      );
      if (!Number.isFinite(duration) || duration < 1 || duration > 90)
        throw Error("Unexpected duration; pending artifact preserved.");
      await rename(temp, path);
      await serialize(async () => {
        manifest.takes.push({
          ...take,
          file: basename(path),
          synthetic: true,
          language: take.accent,
          scriptSha256: hash(take.text),
          audioSha256: hash(bytes),
          durationSeconds: duration,
          generationId,
          estimatedInputCostUsd: reservation.costUsd,
          listeningStatus: "pending human listening review",
        });
        await atomic(manifestPath, manifest);
        reservation.status = "completed";
        await writeLedger(ledger);
        generated++;
        if (generated % 10 === 0 || generated === pending.length)
          console.log(
            JSON.stringify({
              completed: manifest.takes.length,
              total: takes.length,
              generated,
              concurrency,
              requestsPerMinute: generated / ((Date.now() - started) / 60000),
              lastTake: take.takeId,
            }),
          );
      });
    });
    const elapsed = (Date.now() - started) / 1000;
    const report = {
      completed: manifest.takes.length,
      newlyGenerated: generated,
      reused: manifest.takes.filter((t) => t.reusedFrom).length,
      seconds: manifest.takes.reduce((s, t) => s + t.durationSeconds, 0),
      estimatedInputCostUsd: remainingCost,
      concurrency,
      requestsPerSecond,
      wallSeconds: elapsed,
      requestsPerMinute: generated / (elapsed / 60),
      manifest: manifestPath,
    };
    await atomic(join(output, "generation-report.json"), report);
    console.log(JSON.stringify(report));
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
