#!/usr/bin/env node
/** Repository-local OpenRouter authoring CLI. No token is returned or passed in argv. */
import { createServer } from "node:http";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  lstat,
  open,
  rename,
  rm,
} from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STORE = join(ROOT, ".cli/openrouter");
const TOKEN = join(STORE, "token");
const API = "https://openrouter.ai/api/v1";
process.umask(0o077);
function fail(message) {
  throw new Error(message);
}
export async function safeStore() {
  for (const p of [join(ROOT, ".cli"), STORE]) {
    try {
      await mkdir(p, { mode: 0o700 });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    const s = await lstat(p);
    if (
      s.isSymbolicLink() ||
      !s.isDirectory() ||
      s.uid !== process.getuid() ||
      s.mode & 0o077
    )
      fail(
        "Credential directory must be a private, owner-controlled directory without symlinks.",
      );
  }
  try {
    execFileSync(
      "git",
      ["check-ignore", "--quiet", "--", ".cli/openrouter/token"],
      { cwd: ROOT, stdio: "ignore" },
    );
  } catch {
    fail("Credential path is not gitignored.");
  }
  if (
    execFileSync("git", ["ls-files", "--", ".cli/"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim()
  )
    fail("Credential directory contains tracked files.");
}
async function readToken() {
  await safeStore();
  let handle;
  try {
    handle = await open(TOKEN, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.uid !== process.getuid() || stat.mode & 0o077)
      fail("Token must be an owner-only regular file.");
    return (await handle.readFile("utf8")).trim();
  } catch (e) {
    if (e.code === "ENOENT")
      fail("Not logged in. Run npm run openrouter -- login.");
    throw e;
  } finally {
    await handle?.close();
  }
}
export async function api(path, options = {}, authenticated = true) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (authenticated) headers.Authorization = `Bearer ${await readToken()}`;
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    fail(
      "OpenRouter request failed or timed out. No automatic retry was made.",
    );
  }
  if (!response.ok)
    fail(
      `OpenRouter returned HTTP ${response.status}. Response body withheld to protect credentials.`,
    );
  return response;
}
export async function listModels() {
  const j = await (
    await api("/models?output_modalities=speech", {}, false)
  ).json();
  return j.data || [];
}
export function estimateCost(texts, model) {
  const prompt = Number(model.pricing?.prompt);
  const completion = Number(model.pricing?.completion);
  if (!Number.isFinite(prompt) || prompt < 0 || completion !== 0)
    fail(
      "This model has variable output pricing. Choose a per-character model with zero completion pricing for a bounded estimate.",
    );
  return texts.reduce((n, t) => n + Array.from(t).length, 0) * prompt;
}
async function login() {
  await safeStore();
  try {
    await lstat(TOKEN);
    fail(
      "A token already exists. Run status; remove it manually only if you intend to replace it.",
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  let exchanging = false;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const security = {
      "Content-Type": "text/html;charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'",
    };
    const send = (status, text) => {
      res.writeHead(status, security);
      res.end(
        `<!doctype html><title>PTE Studio authoring</title><p>${text}</p><p>You can close this tab.</p>`,
      );
    };
    if (req.method !== "GET" || url.pathname !== "/callback") {
      send(404, "Not found.");
      return;
    }
    const actual = url.searchParams.get("state") || "";
    if (
      actual.length !== state.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(state)) ||
      !url.searchParams.get("code")
    ) {
      send(
        400,
        "Authorization was not completed. Restart login in the terminal.",
      );
      return;
    }
    if (exchanging) {
      send(409, "Authorization is already being completed.");
      return;
    }
    exchanging = true;
    try {
      const response = await api(
        "/auth/keys",
        {
          method: "POST",
          body: JSON.stringify({
            code: url.searchParams.get("code"),
            code_verifier: verifier,
            code_challenge_method: "S256",
          }),
        },
        false,
      );
      const data = await response.json();
      if (typeof data.key !== "string" || !data.key.startsWith("sk-or-"))
        fail("Unexpected authorization response.");
      const file = await open(
        TOKEN,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await file.writeFile(data.key + "\n");
      } finally {
        await file.close();
      }
      send(
        200,
        "OpenRouter connected. Your credential was saved privately in this repository.",
      );
      console.log(
        "Login complete. Token saved in .cli/openrouter/token with mode 0600.",
      );
      clearTimeout(timer);
      server.close();
    } catch {
      send(
        502,
        "Authorization could not be saved. Check the terminal and restart login.",
      );
      console.error("Login failed. No credential response was printed.");
      clearTimeout(timer);
      server.close();
      process.exitCode = 1;
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  const authorize = new URL("https://openrouter.ai/auth");
  authorize.search = new URLSearchParams({
    callback_url: `http://localhost:${port}/callback`,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    key_label: "PTE Studio content authoring",
  }).toString();
  const timer = setTimeout(() => {
    console.error("Login expired after 10 minutes. No token was saved.");
    server.close();
    process.exitCode = 1;
  }, 600000);
  console.log(
    JSON.stringify({
      authorizeUrl: authorize.toString(),
      credentialPath: ".cli/openrouter/token",
    }),
  );
}
async function status() {
  const j = await (await api("/key")).json();
  const d = j.data || {};
  console.log(
    JSON.stringify(
      {
        authenticated: true,
        usageUsd: d.usage,

        limit: d.limit,
        limitRemaining: d.limit_remaining,
        isFreeTier: d.is_free_tier,
      },
      null,
      2,
    ),
  );
}
async function selection(args) {
  const modelArg = args.indexOf("--model");
  const modelId =
    modelArg >= 0 ? args[modelArg + 1] : "mistralai/voxtral-mini-tts-2603";
  const voiceArg = args.indexOf("--voice");
  const voice = voiceArg >= 0 ? args[voiceArg + 1] : "en_paul_neutral";
  const onlyArg = args.indexOf("--question");
  const only = onlyArg >= 0 ? args[onlyArg + 1] : null;
  const qs = JSON.parse(
    await readFile(join(ROOT, "content/questions.json"), "utf8"),
  );
  const selected = qs.filter((q) => q.audioText && (!only || q.id === only));
  if (!selected.length) fail("No matching audio questions.");
  const model = (await listModels()).find((m) => m.id === modelId);
  if (!model) fail("Speech model is unavailable.");
  if (!model.supported_voices?.includes(voice))
    fail("Voice is not listed for this model.");
  const cost = estimateCost(
    selected.map((q) => q.audioText),
    model,
  );
  return { qs, selected, model, voice, cost };
}
export function enforceBudget(cost, limit, used) {
  if (
    ![cost, limit, used].every(Number.isFinite) ||
    cost < 0 ||
    limit <= 0 ||
    used < 0 ||
    used + cost > limit + 1e-9
  )
    fail(
      "Project spending limit would be exceeded. Stop and ask the operator before raising the budget.",
    );
}
export async function readLedger() {
  const path = join(STORE, "spending.json");
  try {
    const stat = await lstat(path);
    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      stat.uid !== process.getuid() ||
      stat.mode & 0o077
    )
      fail("Unsafe spending ledger.");
    const data = JSON.parse(await readFile(path, "utf8"));
    if (
      data.schemaVersion !== 1 ||
      !Array.isArray(data.reservations) ||
      !data.reservations.every(
        (r) => Number.isFinite(r.costUsd) && r.costUsd >= 0,
      )
    )
      fail("Invalid spending ledger.");
    return data;
  } catch (e) {
    if (e.code === "ENOENT") return { schemaVersion: 1, reservations: [] };
    throw e;
  }
}
export async function writeLedger(data) {
  const tmp = join(
    STORE,
    "spending." + randomBytes(8).toString("hex") + ".tmp",
  );
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  await rename(tmp, join(STORE, "spending.json"));
}
export async function withGenerationLock(task) {
  await safeStore();
  const lockPath = join(STORE, "generation.lock");
  let lock;
  try {
    lock = await open(
      lockPath,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
  } catch {
    fail(
      "Another generation or an interrupted run owns the generation lock. Reconcile the ledger before clearing a stale lock.",
    );
  }
  try {
    await lock.writeFile(String(process.pid));
    return await task();
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
async function generate(args) {
  return withGenerationLock(() => generateLocked(args));
}
async function generateLocked(args) {
  const { qs, selected, model, voice, cost } = await selection(args);
  const capAt = args.indexOf("--max-usd");
  const cap = capAt >= 0 ? Number(args[capAt + 1]) : NaN;
  if (!args.includes("--confirm-spend") || !Number.isFinite(cap) || cap <= 0)
    fail(
      "Generation requires --confirm-spend and a positive --max-usd limit after reviewing plan.",
    );
  if (cost > cap)
    fail(
      `Estimated input cost $${cost.toFixed(4)} exceeds the supplied limit.`,
    );
  const policy = JSON.parse(
    await readFile(join(ROOT, "content/authoring.json"), "utf8"),
  );
  const limit = policy.spendingLimitUsd;
  if (!policy.requiresOperatorApprovalToIncrease)
    fail("Operator budget approval policy is missing.");
  const keyState = (await (await api("/key")).json()).data;
  if (
    !Number.isFinite(keyState.limit) ||
    keyState.limit > limit ||
    keyState.limit_reset
  )
    fail(
      "Set this OpenRouter key to the project total budget without a reset before generation.",
    );
  const ledger = await readLedger();
  const reserved = ledger.reservations.reduce((n, r) => n + r.costUsd, 0);
  enforceBudget(cost, limit, Math.max(reserved, Number(keyState.usage) || 0));
  const manifestPath = join(ROOT, "content/narration.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  let committedEstimate = 0;
  for (const q of selected) {
    const audio = `audio/${q.id}.mp3`;
    const output = join(ROOT, "public", audio);
    try {
      await lstat(output);
      const previous = manifest.takes.find(
        (t) =>
          t.questionId === q.id &&
          t.audio === audio &&
          t.model === model.id &&
          t.voice === voice &&
          t.scriptSha256 ===
            createHash("sha256").update(q.audioText).digest("hex"),
      );
      if (previous) {
        console.log(`${q.id}: existing matching take retained`);
        continue;
      }
      fail(
        `Existing take for ${q.id} differs from this request; it was preserved.`,
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }

    const costUsd = estimateCost([q.audioText], model);
    const keyUsage = (await (await api("/key")).json()).data;
    if (
      !Number.isFinite(keyUsage.limit) ||
      keyUsage.limit > limit ||
      keyUsage.limit_reset
    )
      fail("Provider budget guard changed; stop and ask the operator.");
    enforceBudget(
      costUsd,
      limit,
      Math.max(
        ledger.reservations.reduce((n, r) => n + r.costUsd, 0),
        Number(keyUsage.usage) || 0,
      ),
    );
    const reservation = {
      questionId: q.id,
      model: model.id,
      costUsd,
      status: "reserved",
      at: new Date().toISOString(),
    };
    ledger.reservations.push(reservation);
    await writeLedger(ledger);
    const response = await api("/audio/speech", {
      method: "POST",
      body: JSON.stringify({
        model: model.id,
        input: q.audioText,
        voice,
        response_format: "mp3",
      }),
    });
    const mime = response.headers.get("content-type") || "";
    if (!mime.startsWith("audio/"))
      fail("OpenRouter returned non-audio data; nothing was written.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 128 || bytes.length > 20 * 1024 * 1024)
      fail("Audio response was empty or unexpectedly large.");
    const tmp = output + ".pending";
    await writeFile(tmp, bytes, { flag: "wx" });
    let info;
    try {
      info = execFileSync("afinfo", [tmp], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      await rm(tmp, { force: true });
      fail(
        "Audio could not be inspected. Install the documented audio inspector before retrying.",
      );
    }
    const duration = Number(
      /estimated duration:\s*([0-9.]+)\s*sec/i.exec(info)?.[1],
    );
    if (!Number.isFinite(duration) || duration <= 0) {
      await rm(tmp, { force: true });
      fail("Audio inspector did not report a positive duration.");
    }

    await rename(tmp, output);
    q.audio = audio;
    reservation.status = "completed";
    await writeLedger(ledger);
    manifest.takes = manifest.takes.filter((t) => t.questionId !== q.id);
    manifest.takes.push({
      questionId: q.id,
      audio,
      scriptField: `content/questions.json#${q.id}.audioText`,
      scriptSha256: createHash("sha256").update(q.audioText).digest("hex"),
      audioSha256: createHash("sha256").update(bytes).digest("hex"),
      durationSeconds: duration,
      engine: "OpenRouter speech API",
      model: model.id,
      voice,
      language: "en",
      synthetic: true,
      generationId: response.headers.get("x-generation-id"),
      estimatedInputCostUsd: estimateCost([q.audioText], model),
      listeningStatus: "pending human listening review",
      pronunciationNotes:
        "No substitutions. Group discussion currently uses one narrator.",
    });
    // Checkpoint each successful item so an interrupted run never repeats completed paid calls.
    await writeFile(
      join(ROOT, "content/questions.json"),
      JSON.stringify(qs, null, 2) + "\n",
    );
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    committedEstimate += estimateCost([q.audioText], model);
    console.log(
      `${q.id}: saved ${duration.toFixed(1)}s; cumulative estimated input cost $${committedEstimate.toFixed(4)}`,
    );
  }
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "login") await login();
  else if (command === "status") await status();
  else if (command === "models")
    console.log(
      JSON.stringify(
        (await listModels()).map((m) => ({
          id: m.id,
          pricing: m.pricing,
          voices: m.supported_voices,
        })),
        null,
        2,
      ),
    );
  else if (command === "plan") {
    const s = await selection(args);
    console.log(
      JSON.stringify(
        {
          model: s.model.id,
          voice: s.voice,
          questions: s.selected.length,
          characters: s.selected.reduce(
            (n, q) => n + Array.from(q.audioText).length,
            0,
          ),
          estimatedInputCostUsd: s.cost,
          generate:
            "npm run openrouter -- tts --confirm-spend --max-usd <approved budget>",
          note: "Estimate uses current per-character model rate; account-level charges may differ. No generation performed.",
        },
        null,
        2,
      ),
    );
  } else if (command === "tts") await generate(args);
  else
    console.log(
      "Usage: npm run openrouter -- login | status | models | plan | tts\nTTS options: --model ID --voice ID --question ID --confirm-spend --max-usd NUMBER",
    );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : "Operation failed.");
    process.exitCode = 1;
  });
}
