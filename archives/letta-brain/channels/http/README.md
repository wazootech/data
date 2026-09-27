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

## A provider that rate-limited the turn

Data's agent answers from a free-tier provider, so a turn can come back as a
provider rate limit (`429`, `"retryable": true`) instead of an answer. The
provider never ran that turn, so nothing was written to memory or to the
conversation, and re-running it has no side effects.

The service waits and retries the same turn in place, honoring the provider's
own `retryDelay` when it names one and backing off otherwise, up to
`DATA_PROVIDER_RETRY_ATTEMPTS` times. A retry never starts another
conversation: it re-runs the question against the same session, so a recovered
turn continues the conversation the caller already had.

The wait plus the retry has to fit inside `DATA_LETTA_TIMEOUT_MS`, so a retry
that would overrun the turn budget is skipped and the rate-limit error is
returned as it came. Only explicitly retryable provider failures are retried:
`isRetryableProviderFailure` ignores a missing conversation, an unconfigured
provider, a timeout, and every other failure, so a retry cannot paper over a
real error.

This does not give Data a second provider. A durable outage — an exhausted
daily quota, or a provider that stays down — still fails the turn, and
`wazootech/data#9` tracks that decision.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATA_BRAIN` | `letta` (default) answers from the self-hosted agent; `zo` is the pre-migration persona path. |
| `DATA_LETTA_AGENT_ID` | The agent to answer as. Defaults to Data's agent. |
| `DATA_LETTA_BIN` | The Letta CLI. Defaults to `letta`, resolved against `PATH`. |
| `DATA_LETTA_TIMEOUT_MS` | Turn timeout before the child process is killed. Defaults to `180000`; the live service sets `420000`, because a question that sends the agent through a long tool loop can take minutes while a simple one answers in seconds. |
| `DATA_PERSONA_ID` | Persona id for the `DATA_BRAIN=zo` path only. |
| `DATA_PROVIDER_RETRY_ATTEMPTS` | How many times a rate-limited turn is retried in place. Defaults to `2`. |
| `DATA_PROVIDER_RETRY_CAP_MS` | Longest single wait before a retry. Defaults to `60000`. |
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
