# data-http

Data's live surface. One process, two endpoints, no dependencies: it reads the question
off the wire, routes it into Data's Zo persona, and returns the answer.

This directory is also the service's working directory, and its own directory is where
the runtime keeps state: `data/conversations.json` maps a caller's `session` key to the
Zo conversation that continues it. That directory is gitignored, because it is runtime
state, not repository content.

## Endpoints

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `GET` | `/health` | — | `{ ok, agent, service, personaId, uptimeSeconds, conversations }` |
| `POST` | `/ask` | `{ question: string, session?: string }` | `{ answer: string, conversationId?: string }` |

`/health` reports readiness without calling the model, so a deploy can prove the process
came up without spending a turn. `POST /ask` without a `session` key answers a
one-off question; with one, it continues that caller's conversation.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATA_PERSONA_ID` | Persona the question is routed into. Required; the service refuses requests without it. |
| `PORT` | Set by the Zo service. Defaults to `8788` from a shell. |
| `DATA_HTTP_TOKEN` | Optional shared secret. When set, callers must send it as `x-data-token`. |
| `DATA_MODEL_NAME` | Optional model override for the persona call. |
| `ZO_API_BASE` | Optional Zo API base. Defaults to `https://api.zo.computer`. |
| `ZO_CLIENT_IDENTITY_TOKEN` | Zo credential. Loaded from `/root/.zo_secrets` when the process starts without it. |

The persona is the source of truth for Data's identity, and it is built from
`agent/instructions.md`. The service never copies the prompt; it names the persona.

## Running it

```sh
# from a shell, with the persona id set
DATA_PERSONA_ID=<id> bun run ./index.ts

# the service itself, as registered on the Zo host
bun run ./index.ts   # workdir: this directory, mode http, private
```

Readiness line, which the deploy workflow waits for:

```text
ready: data-http on port <port> persona <persona id>
```
