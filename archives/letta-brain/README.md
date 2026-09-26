# Archives: the Letta brain

Retired 2026-09-26. Nothing here is read by anything.

## What it was

Between 2026-09-25 and 2026-09-26 Data ran as a self-hosted Letta agent
(Letta Code, `--backend local`) on the Zo host. The point was memory: the agent
owned a git-backed directory of markdown, read it at the start of a turn, and
committed a record in the same turn it learned something, so an investigation's
findings outlived the session without a handoff.

The pieces that existed for that:

| Path | What it did |
| --- | --- |
| `channels/http/` | The `data-http` Zo service. Turned a question into one headless Letta turn (`letta --backend local --agent <id> -p <question> --output-format json`) and returned the answer, reusing the `conversation_id` for the next question on the same session. |
| `lib/zo-secrets.ts` | Parsed `/root/.zo_secrets` and re-exported Data's prefixed provider keys under their canonical names. |
| `lib/conversation-recovery.ts` | Detected the backend's missing-conversation error so a dead `conversation_id` cost one extra turn instead of bricking the session. |
| `lib/sync-persona.ts`, `scripts/sync-persona.ts` | Seeded `agent/instructions.md` into the agent's memory as `system/persona.md`. |
| `services/http-api.md` | The `data-http` service record. |

## Why it was retired

It made one support agent into two services, a local agent process, a provider
key, a model configuration, and a persona-sync script — and the memory it bought
was never the constraint. Data is read-only by design and hands its findings to
Computer; the records that matter land as published artifacts through a pull
request either way.

Against Goop, which does the same job with a Zo persona and one bridge, the
difference was pure machinery.

## What replaced it

A Zo persona (`64e4d78b-cf2a-43e9-839f-33b7e48af8e5`) and the `data-discord`
bridge in `channels/discord/`, which calls `POST /zo/ask` with `persona_id` set.
Data keeps no runtime memory. Rollback is a service registration and a
`git revert`, not a migration.
