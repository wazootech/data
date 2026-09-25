/**
 * Data's HTTP surface.
 *
 * Data is Wazoo's developer-support agent. This service is the smallest thing
 * that makes it reachable: it takes a question over HTTP and routes it into
 * Data's brain, so the answer arrives with Data's identity, its scoping, and a
 * conversation that continues across calls instead of starting over.
 *
 * The brain is a self-hosted Letta agent (Letta Code, `--backend local`), whose
 * memory is a local git repository of markdown under
 * `~/.letta/lc-local-backend/memfs/<agent-id>/memory/`. Its identity lives in
 * that memory's `system/persona.md`, seeded from `agent/instructions.md`, so
 * this file holds no prompt of its own and cannot disagree with the repository
 * about who Data is. One question is one headless turn:
 *   letta --backend local --agent <id> -p <question> --output-format json
 * and the `conversation_id` that comes back is reused for the next question on
 * the same session, which is what makes a conversation continue.
 *
 * It is deliberately thin: the agent is the agent, and this file owns transport,
 * session mapping, and nothing else. Set `DATA_BRAIN=zo` to answer from the Zo
 * persona instead — that path is the rollback, and wazootech/data#9 tracks the
 * migration. Both paths share the same framing and session bookkeeping.
 *
 * Runtime: any Node-compatible runtime. The Zo host runs it with Bun:
 *   bun run ./index.ts
 *
 * Routes:
 *   GET  /health  liveness, the brain Data answers from, and the uptime
 *   POST /ask     { question, session? } -> { answer, conversationId }
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { missingSecrets, parseZoSecrets } from "../../lib/zo-secrets.ts";

/**
 * Managed services start from a bare environment; Zo secrets live in
 * /root/.zo_secrets (sourced by interactive shells). Load them so the service
 * behaves the same under supervisord and from a shell.
 *
 * With no `names` this loads the whole file, but only when Zo did not inject its
 * token — a service the platform started already carries
 * `ZO_CLIENT_IDENTITY_TOKEN`, and skipping the file there would leave Data's own
 * provider key unset. Naming the keys loads them either way; a value the process
 * already has always wins.
 */
function loadZoSecrets(names?: readonly string[]): void {
  if (names === undefined && process.env.ZO_CLIENT_IDENTITY_TOKEN) return;
  const file = "/root/.zo_secrets";
  if (!existsSync(file)) return;
  const missing = missingSecrets(parseZoSecrets(readFileSync(file, "utf8")), process.env, names);
  for (const [key, value] of Object.entries(missing)) process.env[key] = value;
  const loaded = Object.keys(missing).length;
  if (loaded > 0) {
    const scope = names === undefined ? "" : ` (${names.join(", ")})`;
    console.log(new Date().toISOString(), `secrets: loaded ${loaded} var(s) from ${file}${scope}`);
  }
}

/** Data's own provider key; read by name because the platform injects Zo's token. */
const PROVIDER_SECRET_NAMES = ["DATA_OPENROUTER_API_KEY", "OPENROUTER_API_KEY"] as const;

loadZoSecrets();
loadZoSecrets(PROVIDER_SECRET_NAMES);

/**
 * The Letta harness reads a provider key under its canonical name only: a
 * prefixed secret (`DATA_OPENROUTER_API_KEY`) is invisible to it, and the turn
 * fails with `Provider is not configured: openrouter`. Export the alias so the
 * bulk load above is enough to make Data's own key usable.
 */
function aliasProviderKeys(): void {
  if (!process.env.OPENROUTER_API_KEY && process.env.DATA_OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = process.env.DATA_OPENROUTER_API_KEY;
    console.log(new Date().toISOString(), "provider: exported DATA_OPENROUTER_API_KEY as OPENROUTER_API_KEY");
  }
}
aliasProviderKeys();

const APP_ROOT = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(APP_ROOT, "data");
const CONVERSATIONS_PATH = join(STATE_DIR, "conversations.json");
mkdirSync(STATE_DIR, { recursive: true });

/** `letta` answers from the self-hosted agent; `zo` is the persona fallback. */
const BRAIN = (process.env.DATA_BRAIN ?? "letta").trim().toLowerCase();

/** The Letta CLI. Resolved against PATH so it works under a bare supervisor env. */
const LETTA_BIN = (process.env.DATA_LETTA_BIN ?? "letta").trim();
const LETTA_TIMEOUT_MS = Number(process.env.DATA_LETTA_TIMEOUT_MS ?? 180_000);

/** Data's self-hosted agent, created on 2026-09-25; see wazootech/data#9. */
const LETTA_AGENT_ID = (
  process.env.DATA_LETTA_AGENT_ID ?? "agent-local-777e7e52-1533-4d8a-ac04-d5646251edce"
).trim();

const ZO_API = (process.env.ZO_API_BASE ?? "https://api.zo.computer").replace(/\/+$/u, "");
const PERSONA_ID = (process.env.DATA_PERSONA_ID ?? "").trim();
const SHARED_TOKEN = (process.env.DATA_HTTP_TOKEN ?? "").trim();
const PORT = Number(process.env.PORT ?? process.env.DATA_HTTP_PORT ?? 8788);
const ZO_TOKEN = (process.env.ZO_API_TOKEN ?? process.env.ZO_CLIENT_IDENTITY_TOKEN ?? "").trim();

const STARTED_AT = Date.now();

type Conversations = Record<string, { conversation_id: string; updated_at: string }>;

function readConversations(): Conversations {
  try {
    return JSON.parse(readFileSync(CONVERSATIONS_PATH, "utf8")) as Conversations;
  } catch {
    return {};
  }
}

let conversations = readConversations();

function conversationFor(session: string | undefined): string | undefined {
  return session === undefined ? undefined : conversations[session]?.conversation_id;
}

function rememberConversation(session: string | undefined, conversationId: string | undefined): void {
  if (session === undefined || conversationId === undefined) return;
  conversations = { ...conversations, [session]: { conversation_id: conversationId, updated_at: new Date().toISOString() } };
  try {
    writeFileSync(CONVERSATIONS_PATH, `${JSON.stringify(conversations, null, 2)}\n`);
  } catch (error) {
    console.error(new Date().toISOString(), "conversation state could not be written", error);
  }
}

/**
 * Frames a caller's question for the agent. Data's instructions decide how the
 * answer is written; this only says where the question came from, because the
 * surface is context the agent cannot see for itself.
 */
function frameQuestion(question: string, source: string | undefined): string {
  return [
    "[HTTP API]",
    source === undefined ? undefined : `Caller: ${source}`,
    "Answer as Data, from repository source and documentation, citing what you used.",
    "",
    question,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

/** Resolves a command name against PATH, so the service does not need one. */
function resolveBin(bin: string): string | undefined {
  if (bin.includes("/")) return existsSync(bin) ? bin : undefined;
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (dir.length === 0) continue;
    const candidate = join(dir, bin);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const LETTA_PATH = resolveBin(LETTA_BIN);

/**
 * The local backend is a file-backed store, so two turns must never run at once.
 * Questions queue instead, which also keeps a session's turns in order.
 */
let turnQueue: Promise<unknown> = Promise.resolve();

function serializeTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = turnQueue.then(task, task);
  turnQueue = run.catch(() => undefined);
  return run;
}

type LettaTurn = { result: string; conversation_id?: string; is_error?: boolean };

function runLetta(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(LETTA_PATH ?? LETTA_BIN, args, { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      stderr += `\ntimed out after ${LETTA_TIMEOUT_MS}ms`;
    }, LETTA_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: Error) => {
      clearTimeout(timer);
      reject(new Error(`could not run ${LETTA_BIN}: ${error.message}`));
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** `--output-format json` prints one result object; tolerate surrounding noise. */
function parseLettaResult(stdout: string): LettaTurn | undefined {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(stdout.slice(start, end + 1)) as LettaTurn;
  } catch {
    return undefined;
  }
}

async function askLetta(
  question: string,
  session: string | undefined,
  source: string | undefined,
): Promise<{ answer: string; conversationId: string | undefined }> {
  if (LETTA_PATH === undefined) {
    throw new Error(`no Letta CLI: ${LETTA_BIN} is not on PATH (set DATA_LETTA_BIN)`);
  }
  const existing = conversationFor(session);
  const args = ["--backend", "local", "--output-format", "json"];
  if (existing === undefined) args.push("--agent", LETTA_AGENT_ID);
  else args.push("--conversation", existing);
  args.push("-p", frameQuestion(question, source));

  const { code, stdout, stderr } = await runLetta(args);
  const parsed = parseLettaResult(stdout);
  if (parsed === undefined) {
    const detail = (stderr.trim() || stdout.trim()).slice(-300);
    throw new Error(`letta -> exit ${code}: ${detail.length > 0 ? detail : "no output"}`);
  }
  if (parsed.is_error === true || (code ?? 0) !== 0) {
    const detail = typeof parsed.result === "string" && parsed.result.trim().length > 0
      ? parsed.result.trim()
      : (stderr.trim() || stdout.trim()).slice(-300);
    throw new Error(`letta -> exit ${code}: ${detail}`);
  }
  const conversationId = typeof parsed.conversation_id === "string" ? parsed.conversation_id : existing;
  rememberConversation(session, conversationId);
  const answer = typeof parsed.result === "string" ? parsed.result.trim() : JSON.stringify(parsed.result, null, 2);
  return { answer, conversationId };
}

/** The pre-migration path: Data's Zo persona, kept as `DATA_BRAIN=zo`. */
async function askViaZo(
  question: string,
  session: string | undefined,
  source: string | undefined,
): Promise<{ answer: string; conversationId: string | undefined }> {
  if (ZO_TOKEN.length === 0) throw new Error("no Zo credential: set ZO_CLIENT_IDENTITY_TOKEN");
  if (PERSONA_ID.length === 0) throw new Error("no persona: set DATA_PERSONA_ID");
  const body: Record<string, unknown> = { input: frameQuestion(question, source), persona_id: PERSONA_ID };
  const existing = conversationFor(session);
  if (existing !== undefined) body.conversation_id = existing;
  const response = await fetch(`${ZO_API}/zo/ask`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${ZO_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`zo/ask -> ${response.status} ${(await response.text()).slice(0, 300)}`);
  }
  const data = (await response.json()) as { conversation_id?: string; output?: unknown };
  const conversationId = data.conversation_id ?? response.headers.get("x-conversation-id") ?? undefined;
  rememberConversation(session, conversationId);
  const answer = typeof data.output === "string" ? data.output : JSON.stringify(data.output, null, 2);
  return { answer, conversationId };
}

async function askData(
  question: string,
  session: string | undefined,
  source: string | undefined,
): Promise<{ answer: string; conversationId: string | undefined }> {
  if (BRAIN === "zo") return askViaZo(question, session, source);
  return serializeTurn(() => askLetta(question, session, source));
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(body);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 64 * 1024) throw new Error("request body too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

async function handleAsk(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (SHARED_TOKEN.length > 0) {
    const supplied = readString(request.headers["x-data-token"]);
    if (supplied !== SHARED_TOKEN) {
      json(response, 401, { error: "unauthorized" });
      return;
    }
  }
  let payload: unknown;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    json(response, 400, { error: `unreadable body: ${String(error)}` });
    return;
  }
  if (typeof payload !== "object" || payload === null) {
    json(response, 400, { error: "send a JSON object with a `question`" });
    return;
  }
  const fields = payload as { question?: unknown; session?: unknown; source?: unknown };
  const question = readString(fields.question);
  if (question === undefined) {
    json(response, 400, { error: "`question` is required" });
    return;
  }
  try {
    const { answer, conversationId } = await askData(question, readString(fields.session), readString(fields.source));
    json(response, 200, { answer, conversationId: conversationId ?? null });
  } catch (error) {
    console.error(new Date().toISOString(), "ask failed", error);
    json(response, 502, { error: String(error) });
  }
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, {
      agent: "data",
      brain: BRAIN,
      conversations: Object.keys(conversations).length,
      ok: true,
      lettaAgentId: BRAIN === "letta" ? LETTA_AGENT_ID : null,
      lettaBin: BRAIN === "letta" ? (LETTA_PATH ?? null) : null,
      personaId: BRAIN === "zo" && PERSONA_ID.length > 0 ? PERSONA_ID : null,
      service: "data-http",
      uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/ask") {
    void handleAsk(request, response);
    return;
  }
  json(response, 404, { error: "GET /health or POST /ask" });
});

server.listen(PORT, () => {
  // The deploy step greps a running service's log for this line to prove the
  // restart landed on the revision that was just pushed.
  const target = BRAIN === "letta" ? `agent ${LETTA_AGENT_ID}` : `persona ${PERSONA_ID || "(unset)"}`;
  console.log(new Date().toISOString(), `ready: data-http on port ${PORT} brain ${BRAIN} ${target}`);
  if (BRAIN === "letta" && LETTA_PATH === undefined) {
    console.warn(new Date().toISOString(), `no Letta CLI: ${LETTA_BIN} is not on PATH, so /ask will fail until DATA_LETTA_BIN is set`);
  }
  if (BRAIN === "letta" && process.env.OPENROUTER_API_KEY === undefined && process.env.AI_GATEWAY_API_KEY === undefined) {
    console.warn(new Date().toISOString(), "no provider key: set OPENROUTER_API_KEY (or AI_GATEWAY_API_KEY) or /ask will fail");
  }
  if (BRAIN === "zo" && ZO_TOKEN.length === 0) {
    console.warn(new Date().toISOString(), "no Zo credential: /ask will fail until ZO_CLIENT_IDENTITY_TOKEN is set");
  }
  if (BRAIN === "zo" && PERSONA_ID.length === 0) {
    console.warn(new Date().toISOString(), "no persona id: /ask will fail until DATA_PERSONA_ID is set");
  }
});
