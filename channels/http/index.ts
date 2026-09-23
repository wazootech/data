/**
 * Data's HTTP surface.
 *
 * Data is Wazoo's developer-support agent. This service is the smallest thing
 * that makes it reachable: it takes a question over HTTP and routes it into
 * Data's Zo persona, so the answer arrives with Data's identity, its scoping,
 * and a conversation that continues across calls instead of starting over.
 *
 * It is deliberately thin. The persona is the agent; this file owns transport,
 * session mapping, and nothing else. It holds no prompt of its own, so it cannot
 * disagree with `agent/instructions.md` about who Data is.
 *
 * Runtime: any Node-compatible runtime. The Zo host runs it with Bun:
 *   bun run ./index.ts
 *
 * Routes:
 *   GET  /health  liveness, the persona Data answers as, and the uptime
 *   POST /ask     { question, session? } -> { answer, conversationId }
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Managed services start from a bare environment; Zo secrets live in
 * /root/.zo_secrets (sourced by interactive shells). Load it when the Zo token
 * is absent so the service behaves the same under supervisord and from a shell.
 */
function loadZoSecrets(): void {
  if (process.env.ZO_CLIENT_IDENTITY_TOKEN) return;
  const file = "/root/.zo_secrets";
  if (!existsSync(file)) return;
  let loaded = 0;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("export ")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice("export ".length, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!key || process.env[key]) continue;
    process.env[key] = value;
    loaded++;
  }
  if (loaded > 0) console.log(new Date().toISOString(), `secrets: loaded ${loaded} var(s) from ${file}`);
}
loadZoSecrets();

const APP_ROOT = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(APP_ROOT, "data");
const CONVERSATIONS_PATH = join(STATE_DIR, "conversations.json");
mkdirSync(STATE_DIR, { recursive: true });

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
 * Frames a caller's question for the persona. Data's instructions decide how the
 * answer is written; this only says where the question came from, because the
 * surface is context the persona cannot see for itself.
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

async function askData(
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
      conversations: Object.keys(conversations).length,
      ok: true,
      personaId: PERSONA_ID.length > 0 ? PERSONA_ID : null,
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
  console.log(new Date().toISOString(), `ready: data-http on port ${PORT} persona ${PERSONA_ID || "(unset)"}`);
  if (ZO_TOKEN.length === 0) console.warn(new Date().toISOString(), "no Zo credential: /ask will fail until ZO_CLIENT_IDENTITY_TOKEN is set");
  if (PERSONA_ID.length === 0) console.warn(new Date().toISOString(), "no persona id: /ask will fail until DATA_PERSONA_ID is set");
});
