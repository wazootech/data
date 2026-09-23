# data-discord

Data's Discord channel. One process, no dependencies: it holds the Gateway socket as the
Data application, and routes an admitted `@Data` mention into Data's own HTTP ingress on
the same host.

The bridge is a transport adapter, not a second brain. It normalizes the Discord event and
hands it to `data-http` (`POST /ask`), which is where question routing, the persona, and
session memory already live. That keeps one ingress shape and one place where Data's
identity is resolved, and it means the bridge needs no model credential of its own.

## What it admits

Fail-closed, and every gate must pass:

| Gate | Rule |
| --- | --- |
| Transport | a guild event with a `guild_id` |
| Guild | the guild is in `DATA_DISCORD_GUILD_IDS` |
| Channel | `DATA_DISCORD_CHANNEL_IDS` is empty (any channel in the guild) or contains the channel |
| Author | the author is in `DATA_DISCORD_OWNER_IDS`, or holds a role in `DATA_DISCORD_ROLE_IDS` |
| Content | the message mentions the bot and has text after the mention is stripped |

Message-author bots, webhook messages, and channel DMs are ignored. An admitted message is
answered once: the message id is remembered so a Gateway `RESUME` replaying events cannot
produce a second reply.

Data is read-only by design, so this channel only answers questions. It does not moderate,
file, edit, or merge anything.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATA_DISCORD_BOT_TOKEN` | The Data application's bot token. Required. |
| `DATA_DISCORD_APPLICATION_ID` | The Data application id. One of this or the bot token must be set. |
| `DATA_DISCORD_GUILD_IDS` | Comma-separated guild allowlist. Required; empty admits nothing. |
| `DATA_DISCORD_CHANNEL_IDS` | Optional channel allowlist. Empty means every channel in an admitted guild. |
| `DATA_DISCORD_ROLE_IDS` | Comma-separated roles allowed to reach Data. |
| `DATA_DISCORD_OWNER_IDS` | Comma-separated user ids always admitted. |
| `DATA_HTTP_URL` | Data's ingress. Defaults to `http://127.0.0.1:8788`. |
| `DATA_HTTP_TOKEN` | Shared secret sent as `x-data-token`. Set it here when the ingress has one. |
| `DATA_DISCORD_GATEWAY_URL` | Gateway URL override. For tests, not for production. |
| `DATA_DISCORD_API_BASE` | REST base override. For tests, not for production. |

No Discord identifier is committed to this repository. They arrive through the service
definition, and `DATA_DISCORD_BOT_TOKEN` additionally loads from `/root/.zo_secrets` when
the process starts without it, because managed services do not inherit the host shell.

The application must have the **Message Content Intent** enabled, or Discord closes the
connection with code 4014 and no mention text ever arrives. The bridge detects that close
code, says so once, and retries on a slow backoff instead of exiting, so the service stays
up while the intent is being enabled.

## Running it

```sh
DATA_DISCORD_GUILD_IDS=<guild> DATA_DISCORD_ROLE_IDS=<role> bun run ./index.ts
```
