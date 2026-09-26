# data-http

Data's live surface. One process, two endpoints, no dependencies: it reads the question
off the wire, hands it to Data's brain as one headless turn of a self-hosted Letta agent,
and returns the answer.

The brain is a Letta Code agent on this host, run with `--backend local`, whose memory is
a local git repository under `~/.letta/lc-local-backend/memfs/<agent-id>/memory/`. The
service does not hold a prompt, so it cannot disagree with `agent/instructions.md` about
who Data is — the agent's memory does. See `wazootech/data#9` for the migration.

This directory is also the service's working directory, and its own directory is where
the runtime keeps state: `data/conversations.json` maps a caller's `session` key to the
agent conversation that continues it. That directory is gitignored, because it is runtime
state, not repository content.

## Endpoints

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `GET` | `/health` | — | `{ ok, agent, service, brain, lettaAgentId, lettaBin, personaId, uptimeSeconds, conversations }` |
| `POST` | `/ask` | `{ question: string, session?: string }` | `{ answer: string, conversationId?: string }` |

`/health` reports readiness without calling the model, so a deploy can prove the process
came up without spending a turn. `POST /ask` without a `session` key answers a
one-off question; with one, it continues that caller's conversation.

One turn is one child process:

```sh
letta --backend local --agent <agent id> -p <question> --output-format json
```

The `conversation_id` in the JSON result is stored against the caller's `session` and
passed back as `--conversation <id>` on the next question, which is what makes a
conversation continue. `--conversation` cannot be combined with `--agent`, so the first
question of a session names the agent and later ones name the conversation.

The local backend is a file-backed store, so turns are queued and run one at a time
rather than concurrently.

## Model and provider

The agent's model is host state, not repository state: it lives with the agent in the
local backend, so changing it changes the running brain. Data runs
`openai-compatible/google/gemini-2.5-flash-lite`, a Vercel AI Gateway model reached
through an OpenAI-compatible provider registered at `https://ai-gateway.vercel.sh/v1`.
That routes Data's inference through the account's existing AI credits instead of a
separate provider key.

Register the provider once per host, then point the agent at a handle:

```sh
letta --backend local connect openai-compatible \
  --base-url https://ai-gateway.vercel.sh/v1 \
  --api-key "$AI_GATEWAY_API_KEY"
letta --backend local model set openai-compatible/google/gemini-2.5-flash-lite \
  --agent <agent id>
```

The credential is stored by the local backend under
`~/.letta/lc-local-backend/providers/`, not read from this service's environment, so the
service needs no gateway key of its own.

Do not use the local backend's own `vercel-ai-gateway/*` handles for this. That provider
speaks the Anthropic Messages API, where `max_tokens` is required, and its catalog entries
carry a context window but no max-output field, so every turn fails with
`400 max_tokens: Invalid input: expected number, received null`. The `openai-compatible`
route sets `max_tokens` itself (32000 for this model) and the same gateway key works.

## A conversation the backend no longer has

If the backend's conversation store is replaced — a reset, or state written by a
different backend — the stored `conversation_id` stops resolving. The service
detects the backend's `Conversation <id> not found` failure, drops the id, and
re-runs the question as a fresh conversation: one extra turn instead of a session
that fails forever. The dropped id is not written back, so the next question for
that caller starts over cleanly.

This covers a lost *conversation*, not a lost *agent*. A wiped or re-created
backend loses the agent too, which surfaces as `Agent <id> not found` — a
different shape the service does not retry, because the remedy is operator work:
re-create the agent with `letta --backend local agents create`, then point
`DATA_LETTA_AGENT_ID` at the new id.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATA_BRAIN` | `letta` (default) answers from the self-hosted agent; `zo` is the pre-migration persona path. |
| `DATA_LETTA_AGENT_ID` | The agent to answer as. Defaults to Data's agent. |
| `DATA_LETTA_BIN` | The Letta CLI. Defaults to `letta`, resolved against `PATH`. |
| `DATA_LETTA_TIMEOUT_MS` | Turn timeout before the child process is killed. Defaults to `180000`; the live service sets `420000`, because a question that sends the agent through a long tool loop can take minutes while a simple one answers in seconds. |
| `DATA_PERSONA_ID` | Persona id for the `DATA_BRAIN=zo` path only. |
| `PORT` | Set by the Zo service. Defaults to `8788` from a shell. |
| `DATA_HTTP_TOKEN` | Optional shared secret. When set, callers must send it as `x-data-token`. |
| `DATA_MODEL_NAME` | Optional model override for the persona call. |
| `OPENROUTER_API_KEY`, `GEMINI_API_KEY` | Optional. Each is exported from its `DATA_`-prefixed secret (`DATA_OPENROUTER_API_KEY`, `DATA_GEMINI_API_KEY`) when only that is set, because the Letta harness reads provider keys under their canonical names. `openrouter/*` and `google/*` handles are the ones the local backend offers from these keys. |
| `ZO_API_BASE`, `ZO_CLIENT_IDENTITY_TOKEN` | Zo API base and credential, for the `DATA_BRAIN=zo` path. |

Secrets load from `/root/.zo_secrets` when the process starts without them, because
managed services do not inherit the host shell.

## Running it

```sh
# from a shell, answering as the self-hosted agent
DATA_LETTA_AGENT_ID=<agent id> bun run ./index.ts

# the pre-migration path
DATA_BRAIN=zo DATA_PERSONA_ID=<persona id> bun run ./index.ts

# the service itself, as registered on the Zo host
bun run ./index.ts   # workdir: this directory, mode http, private
```

Readiness line, which the deploy workflow waits for:

```text
ready: data-http on port <port> brain letta agent <agent id>
```
