#!/usr/bin/env bun
/**
 * Data's Discord channel.
 *
 * Holds one Gateway socket as the Data application and turns an admitted
 * mention into a question for Data's own HTTP surface, then posts the answer
 * back into the channel. The bridge owns transport only: admission, the reply
 * limit, and reconnects live here, while the persona, the conversation memory,
 * and the answer itself stay behind `POST /ask` on `channels/http`.
 *
 * That division keeps Data's brain in one place. A second channel adds a way to
 * reach Data; it does not add a second way to think.
 *
 * Admission is default-deny: the guild must be allowlisted, the author must not
 * be a bot, the message must mention the bot, and the author must hold an
 * allowlisted role. Nothing else dispatches.
 *
 * Requires the application's Message Content intent, which is what makes a
 * mention's text readable at all. Discord closes an unsupported IDENTIFY with
 * 4014; the bridge reports the exact fix instead of hot-looping.
 */
import { existsSync, readFileSync } from "node:fs";
import { LOCAL_CLOSE, describeClose } from "../../lib/discord-gateway.ts";

// Managed services start from a bare environment; Zo secrets live in
// /root/.zo_secrets (sourced by interactive shells). Load it when the bot token
// is absent so the bridge behaves the same under supervisord and from a shell.
function loadZoSecrets(): void {
  if (process.env.DATA_DISCORD_BOT_TOKEN) return;
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
    loaded += 1;
  }
  if (loaded > 0) log(`secrets: loaded ${String(loaded)} var(s) from ${file}`);
}

function log(...parts: unknown[]): void {
  console.log(new Date().toISOString(), ...parts);
}

function readEnv(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function readIdList(name: string, fallback = ""): readonly string[] {
  return readEnv(name, fallback)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

loadZoSecrets();

const BOT_TOKEN = readEnv("DATA_DISCORD_BOT_TOKEN");
const HTTP_URL = readEnv("DATA_HTTP_URL", "http://127.0.0.1:8788").replace(/\/+$/u, "");
const HTTP_TOKEN = readEnv("DATA_HTTP_TOKEN");
const GUILD_IDS = readIdList("DATA_DISCORD_GUILD_IDS", "");
const ROLE_IDS = readIdList("DATA_DISCORD_ROLE_IDS", "");
const OWNER_IDS = readIdList("DATA_DISCORD_OWNER_IDS");
const CHANNEL_IDS = readIdList("DATA_DISCORD_CHANNEL_IDS");

const GATEWAY_URL = (process.env.DATA_DISCORD_GATEWAY_URL ?? "wss://gateway.discord.gg/?v=10&encoding=json").trim();
const REST = (process.env.DATA_DISCORD_API_BASE ?? "https://discord.com/api/v10").replace(/\/$/u, "");
const API_VERSION = 10;

// GUILDS | GUILD_MESSAGES | MESSAGE_CONTENT. MESSAGE_CONTENT is privileged and
// must be enabled on the application, or Discord refuses the connection.
const INTENTS = (1 << 0) | (1 << 9) | (1 << 15);

const MAX_REPLY_CHARS = 1900;
const MAX_REPLY_PARTS = 8;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const DISALLOWED_INTENTS_DELAY_MS = 5 * 60_000;
const TYPING_REFRESH_MS = 8_000;

const OP = {
  dispatch: 0,
  heartbeat: 1,
  identify: 2,
  resume: 6,
  reconnect: 7,
  invalidSession: 9,
  hello: 10,
  heartbeatAck: 11,
} as const;

interface GatewaySocket {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

type SocketConstructor = new (url: string) => GatewaySocket;

interface GatewayFrame {
  readonly op: number;
  readonly t?: string | null;
  readonly s?: number | null;
  readonly d?: unknown;
}

interface DiscordUser {
  readonly id: string;
  readonly username?: string;
  readonly global_name?: string | null;
  readonly bot?: boolean;
  readonly discriminator?: string;
}

interface DiscordMessage {
  readonly id: string;
  readonly channel_id: string;
  readonly guild_id?: string;
  readonly content?: string;
  readonly author?: DiscordUser;
  readonly member?: { readonly roles?: readonly string[] };
  readonly webhook_id?: string;
}

interface ReadyPayload {
  readonly session_id?: string;
  readonly resume_gateway_url?: string;
  readonly user?: DiscordUser;
  readonly guilds?: readonly { readonly id: string }[];
}

const answered = new Set<string>();
const ANSWERED_LIMIT = 500;

function rememberAnswered(id: string): boolean {
  if (answered.has(id)) return false;
  answered.add(id);
  if (answered.size > ANSWERED_LIMIT) {
    const oldest = answered.values().next().value;
    if (oldest !== undefined) answered.delete(oldest);
  }
  return true;
}

function chunkReply(text: string, size = MAX_REPLY_CHARS): readonly string[] {
  const clean = text.trim();
  if (clean.length === 0) return [];
  const parts: string[] = [];
  let rest = clean;
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size * 0.5) cut = rest.lastIndexOf(" ", size);
    if (cut < size * 0.5) cut = size;
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) parts.push(rest);
  return parts.slice(0, MAX_REPLY_PARTS);
}

async function discordRequest(
  method: "POST" | "GET",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(`${REST}${path}`, {
    method,
    headers: {
      authorization: `Bot ${BOT_TOKEN}`,
      "content-type": "application/json",
      "user-agent": "DataBridge (https://github.com/wazootech/data, 1.0.0)",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    throw new Error(`discord ${method} ${path} -> ${String(response.status)} ${text.slice(0, 200)}`);
  }
  if (response.status === 204) return null;
  return (await response.json()) as unknown;
}

async function askData(question: string, session: string): Promise<string> {
  const response = await fetch(`${HTTP_URL}/ask`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(HTTP_TOKEN.length === 0 ? {} : { "x-data-token": HTTP_TOKEN }),
    },
    body: JSON.stringify({ question, session }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`data http /ask -> ${String(response.status)} ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(text) as { answer?: string };
  return parsed.answer ?? "";
}

function keepTyping(channelId: string): () => void {
  const beat = (): void => {
    void discordRequest("POST", `/channels/${channelId}/typing`).catch(() => undefined);
  };
  beat();
  const timer = setInterval(beat, TYPING_REFRESH_MS);
  return () => {
    clearInterval(timer);
  };
}

/** True when the message is an admitted mention that should reach Data. */
function admission(message: DiscordMessage): { readonly question: string } | null {
  const author = message.author;
  if (author === undefined) return null;
  if (author.bot === true) return null;
  if (message.webhook_id !== undefined) return null;

  const guildId = message.guild_id ?? "";
  if (guildId.length === 0) return null;
  if (!GUILD_IDS.includes(guildId)) return null;
  if (CHANNEL_IDS.length > 0 && !CHANNEL_IDS.includes(message.channel_id)) return null;

  const isOwner = OWNER_IDS.includes(author.id);
  const roles = message.member?.roles ?? [];
  const holdsRole = roles.some((role) => ROLE_IDS.includes(role));
  if (!isOwner && !holdsRole) return null;

  const content = message.content ?? "";
  const mention = new RegExp(`<@!?${BOT_USER_ID}>`, "gu");
  if (!mention.test(content)) return null;

  const question = content.replace(mention, " ").replace(/\s+/gu, " ").trim();
  if (question.length === 0) return null;
  return { question };
}

let BOT_USER_ID = "";

async function handleMention(message: DiscordMessage): Promise<void> {
  const admitted = admission(message);
  if (admitted === null) return;
  if (!rememberAnswered(message.id)) return;

  const stopTyping = keepTyping(message.channel_id);
  try {
    const answer = await askData(admitted.question, `discord:${message.channel_id}`);
    const parts = chunkReply(answer.length === 0 ? "(Data returned an empty answer.)" : answer);
    for (const [index, part] of parts.entries()) {
      await discordRequest("POST", `/channels/${message.channel_id}/messages`, {
        content: part,
        ...(index === 0
          ? {
              message_reference: {
                message_id: message.id,
                channel_id: message.channel_id,
                ...(message.guild_id === undefined ? {} : { guild_id: message.guild_id }),
                fail_if_not_exists: false,
              },
            }
          : {}),
      });
    }
    log(`answered ${message.id} in ${message.channel_id} (${String(answer.length)} chars, ${String(parts.length)} part(s))`);
  } catch (error) {
    log(`failed to answer ${message.id}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    stopTyping();
  }
}

export function run(): void {
  const discovered = (globalThis as { WebSocket?: SocketConstructor }).WebSocket;
  if (discovered === undefined) {
    log("no global WebSocket in this runtime; Data's Discord channel needs Bun 1.1+ or Node 22+");
    process.exit(1);
  }
  const Socket: SocketConstructor = discovered;
  if (BOT_TOKEN.length === 0) {
    log("DATA_DISCORD_BOT_TOKEN is unset; Data's Discord channel cannot start");
    process.exit(1);
  }

  let sessionId: string | null = null;
  let sequence: number | null = null;
  let gatewayUrl = GATEWAY_URL;
  /** True between a RESUME and its outcome, so a rejected resume is never silent. */
  let resumePending = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let acked = true;
  let attempts = 0;
  let lastErrorAt = 0;

  const stopHeartbeat = (): void => {
    if (heartbeat !== null) clearInterval(heartbeat);
    heartbeat = null;
  };

  const send = (socket: GatewaySocket, op: number, d: unknown): void => {
    socket.send(JSON.stringify({ op, d }));
  };

  const reconnect = (delayMs: number, why: string): void => {
    stopHeartbeat();
    log(`reconnecting in ${String(Math.round(delayMs / 1000))}s: ${why}`);
    setTimeout(connect, delayMs);
  };

  const identify = (socket: GatewaySocket): void => {
    send(socket, OP.identify, {
      token: BOT_TOKEN,
      intents: INTENTS,
      properties: { os: process.platform, browser: "data-bridge", device: "data-bridge" },
    });
  };

  const startHeartbeat = (socket: GatewaySocket, intervalMs: number): void => {
    stopHeartbeat();
    acked = true;
    heartbeat = setInterval(() => {
      if (!acked) {
        stopHeartbeat();
        socket.close(LOCAL_CLOSE.heartbeatUnacknowledged, "local: heartbeat not acknowledged");
        return;
      }
      acked = false;
      send(socket, OP.heartbeat, sequence);
    }, intervalMs);
  };

  function connect(): void {
    const socket = new Socket(gatewayUrl);

    socket.onopen = () => {
      // Label the decision, not the URL. After the first READY the resume URL is in
      // use even when the socket is about to identify fresh, so the old label read
      // "(resume)" for connections that were never resuming (wazootech/data#15).
      log(
        sessionId === null
          ? "gateway socket open (fresh identify)"
          : `gateway socket open (resume from seq ${String(sequence)})`,
      );
    };

    socket.onmessage = (event) => {
      let frame: GatewayFrame;
      try {
        frame = JSON.parse(String(event.data)) as GatewayFrame;
      } catch {
        return;
      }
      if (typeof frame.s === "number") sequence = frame.s;

      if (frame.op === OP.hello) {
        const payload = frame.d as { heartbeat_interval?: number } | null;
        const interval = payload?.heartbeat_interval ?? 41_250;
        if (sessionId === null) {
          identify(socket);
        } else {
          resumePending = true;
          log(`resuming session ${sessionId} at seq ${String(sequence)}`);
          send(socket, OP.resume, { token: BOT_TOKEN, session_id: sessionId, seq: sequence });
        }
        startHeartbeat(socket, interval);
        return;
      }
      if (frame.op === OP.heartbeatAck) {
        acked = true;
        return;
      }
      if (frame.op === OP.heartbeat) {
        send(socket, OP.heartbeat, sequence);
        return;
      }
      if (frame.op === OP.reconnect) {
        stopHeartbeat();
        socket.close(LOCAL_CLOSE.reconnectRequested, "local: reconnect requested");
        return;
      }
      if (frame.op === OP.invalidSession) {
        const resumable = frame.d === true;
        log(
          `session invalidated by Discord (op 9, resumable=${String(resumable)})${resumePending ? ", in reply to our resume" : ""}`,
        );
        resumePending = false;
        if (!resumable) {
          sessionId = null;
          sequence = null;
          gatewayUrl = GATEWAY_URL;
        }
        stopHeartbeat();
        socket.close(LOCAL_CLOSE.invalidSession, "local: invalid session");
        return;
      }
      if (frame.op !== OP.dispatch) return;

      if (frame.t === "READY") {
        const payload = frame.d as ReadyPayload | null;
        if (resumePending) {
          log(
            "the resume was rejected: Discord answered READY instead of RESUMED, so the session was dropped and a fresh one is identifying",
          );
        }
        resumePending = false;
        sessionId = payload?.session_id ?? null;
        if (typeof payload?.resume_gateway_url === "string") gatewayUrl = payload.resume_gateway_url;
        BOT_USER_ID = payload?.user?.id ?? BOT_USER_ID;
        attempts = 0;
        const tag = payload?.user?.username ?? "(unknown)";
        const guilds = payload?.guilds?.map((guild) => guild.id) ?? [];
        log(`ready: data-discord ${tag}#${BOT_USER_ID} guilds=[${guilds.join(",")}]`);
        if (guilds.length === 0) {
          log(
            "READY reports no guilds: invite the Data application to the server with the bot scope; mentions cannot arrive until it is a member",
          );
        }
        return;
      }
      if (frame.t === "RESUMED") {
        attempts = 0;
        resumePending = false;
        log("session resumed");
        return;
      }
      if (frame.t === "MESSAGE_CREATE") {
        const message = frame.d as DiscordMessage | null;
        if (message !== null && typeof message.id === "string") void handleMention(message);
      }
    };

    socket.onerror = (event) => {
      const now = Date.now();
      if (now - lastErrorAt > 30_000) {
        lastErrorAt = now;
        log(`gateway socket error: ${String(event)}`);
      }
    };

    socket.onclose = (event) => {
      stopHeartbeat();
      resumePending = false;
      const code = event.code;
      const described = describeClose(code, event.reason);
      if (code === 4014) {
        log(
          "gateway refused the connection with 4014 (disallowed intents): enable Message Content Intent for the Data application (Discord Developer Portal -> Data -> Bot -> Privileged Gateway Intents), then this process connects on its next attempt.",
        );
        reconnect(DISALLOWED_INTENTS_DELAY_MS, described);
        return;
      }
      if (code === 4004) {
        log("gateway refused the connection with 4004 (authentication failed): DATA_DISCORD_BOT_TOKEN is wrong or rotated");
        reconnect(MAX_BACKOFF_MS, described);
        return;
      }
      if (code === 4013) {
        log("gateway refused the connection with 4013 (invalid intents): the requested intent bits are not valid for this application");
        reconnect(MAX_BACKOFF_MS, described);
        return;
      }
      if (code === 4010 || code === 4011) {
        log(`${described}: sharding must not be changed while resuming`);
        sessionId = null;
        sequence = null;
        gatewayUrl = GATEWAY_URL;
        reconnect(MIN_BACKOFF_MS, described);
        return;
      }
      if (code === 4007 || code === 4008 || code === 4009) {
        sessionId = null;
        sequence = null;
        gatewayUrl = GATEWAY_URL;
      }
      attempts += 1;
      const backoff = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** (attempts - 1));
      const jittered = backoff / 2 + Math.random() * (backoff / 2);
      reconnect(jittered, described);
    };
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      log(`stopping on ${signal}`);
      stopHeartbeat();
      process.exit(0);
    });
  }

  log(`bridge starting: route=${HTTP_URL}/ask guilds=[${GUILD_IDS.join(",")}] roles=[${ROLE_IDS.join(",")}]`);
  connect();
}

if (import.meta.main) run();
