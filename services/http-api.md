# Service: data-http

Data's live surface, and the only long-running process Data runs.

| Field | Value |
| --- | --- |
| Zo service ID | `svc_Q7hVX_ETyho` |
| Label | `data-http` |
| Mode | `http`, private (owner sign-in) |
| Entrypoint | `bun run ./index.ts` |
| Working directory | `/home/workspace/users/etok/workspaces/wazootech/repos/data/channels/http` |
| Endpoint | `https://data-http-etok.zo.computer` |
| Logs | `/dev/shm/data-http.log`, `/dev/shm/data-http_err.log` |
| Source | `channels/http/index.ts` in this repository |

## Environment variable names

`DATA_BRAIN`, `DATA_LETTA_AGENT_ID`, and optionally `DATA_LETTA_BIN`,
`DATA_LETTA_TIMEOUT_MS`, `DATA_HTTP_TOKEN`, `PORT`. The pre-migration path also uses
`DATA_PERSONA_ID`, `DATA_MODEL_NAME`, and `ZO_API_BASE`; `ZO_CLIENT_IDENTITY_TOKEN`,
`DATA_OPENROUTER_API_KEY`, and `DATA_GEMINI_API_KEY` are read from `/root/.zo_secrets` when
the process starts without them, because managed services do not inherit the host shell
environment. Each provider secret is copied onto its canonical name (`OPENROUTER_API_KEY`,
`GEMINI_API_KEY`) so the Letta harness can see it. Values are never recorded here. The agent's model is separate from these: it is the agent's own setting on
the host, currently a Vercel AI Gateway model reached through an `openai-compatible`
provider (see `channels/http/README.md`).

## Recreation

```sh
# register once, then let .github/workflows/deploy.yml keep it current
# mode http, private, local port 8788, workdir as above
DATA_BRAIN=letta DATA_LETTA_AGENT_ID=<agent id> bun run ./index.ts
```

The agent itself is not registered as a Zo service: the service spawns one `letta
--backend local` child process per question, so there is no second long-running process
to keep alive.

## Verification

- 2026-09-23 — registered and started; `GET /health` returned `ok: true` with the
  persona id, and `POST /ask` returned an answer citing `README.md` and `AGENTS.md` from
  this repository. Workdir was the development worktree at registration and was
  re-pointed to the live checkout in this repository once the change landed on `main`.
- 2026-09-25 — repointed onto the self-hosted Letta agent (`DATA_BRAIN=letta`,
  `DATA_LETTA_AGENT_ID=agent-local-777e7e52-1533-4d8a-ac04-d5646251edce`). Verified from
  a shell before deploying: `GET /health` reported `brain: letta` with the agent id and
  the resolved CLI path, `POST /ask` answered in Data's voice (identity seeded from
  `agent/instructions.md` into the agent's memory), a second question on the same
  `session` continued the conversation, and a question about this service answered from
  `channels/http/index.ts` with a citation.
- 2026-09-25 — turn timeout raised to `420000` ms on the live service (`DATA_LETTA_TIMEOUT_MS`).
  Measured the same day: `POST /ask` on a question that sends the agent through a tool loop took
  4m26s and tripped the `180000` ms default (`letta -> exit null: timed out after 180000ms`), while
  a two-sentence question about this service answered in 7.2s citing `channels/http/index.ts`.
  The timeout bounds a turn, not the agent's willingness to investigate.
- 2026-09-25 — Data's own Google key was wired in. With only `DATA_GEMINI_API_KEY` in
  `/root/.zo_secrets` and no canonical `GEMINI_API_KEY` in the environment, the service
  logged `provider: exported DATA_OPENROUTER_API_KEY as OPENROUTER_API_KEY,
  DATA_GEMINI_API_KEY as GEMINI_API_KEY` at startup and `POST /ask` answered from the
  `google/gemini-2.5-flash` handle now configured on the agent (a shell run against this
  worktree, no other provider key set). The key is free-tier: `google/gemini-3.5-flash`
  answered `429 RESOURCE_EXHAUSTED` — 5 requests/minute on
  `generate_content_free_tier_requests` — so a per-model request cap, not the key, is the
  ceiling. The OpenRouter handle it replaced was blocked by the free pool's daily cap.

- 2026-09-26 — Data moved onto the account's AI credits. The OpenRouter and Google
  free-tier keys were the point of failure: a 429 from either surfaced as a 502 out of
  `/ask`, and both had exhausted their caps. The agent now runs
  `openai-compatible/openai/gpt-5-mini` through a Vercel AI Gateway provider
  registered at `https://ai-gateway.vercel.sh/v1`. The local backend's own
  `vercel-ai-gateway/*` handles cannot be used for this: that provider speaks the
  Anthropic Messages API, which requires `max_tokens`, and its catalog entries carry no
  max-output field, so every turn failed with `400 max_tokens: Invalid input: expected
  number, received null` — reproduced on this host. The `openai-compatible` route sets
  `max_tokens` itself (`32000` here). Verified live: a direct
  `POST /v1/chat/completions` to the gateway answered `200`, a headless Letta turn on the
  agent answered, and `POST /ask` on the restarted `data-http` returned `200` with an
  answer. The provider credential is host-local
  (`~/.letta/lc-local-backend/providers/`), so no gateway key is needed in the service
  environment, and the turn is metered to the account's credits rather than a provider key.
  Model choice was measured, not assumed: a free-tier gateway key 403s most models outside
  a small allowlist, and `google/gemini-2.5-flash-lite` is throttled there to roughly 5
  requests per minute — slower than one of Data's tool loops. `openai/gpt-5-mini` was
  chosen after it answered a live source question with the right file and line.
