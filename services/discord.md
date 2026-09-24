# Service: data-discord

Data's Discord channel: the thin socket that lets people in Discord talk to Data. It
holds the Gateway connection as the Data application and forwards each admitted mention
to Data's own HTTP ingress, so the brain stays in one place.

| Field | Value |
| --- | --- |
| Zo service ID | `svc__FQ0NilRSiI` |
| Label | `data-discord` |
| Mode | `process` (no network endpoint) |
| Entrypoint | `bun run ./index.ts` |
| Working directory | `/home/workspace/users/etok/workspaces/wazootech/repos/data/channels/discord` |
| Forwards to | `http://127.0.0.1:8788/ask` (the `data-http` service) |
| Logs | `/dev/shm/data-discord.log`, `/dev/shm/data-discord_err.log` |
| Source | `channels/discord/index.ts` in this repository |

## Environment variable names

`DATA_DISCORD_GUILD_IDS`, `DATA_DISCORD_ROLE_IDS`, `DATA_DISCORD_HTTP_URL` in the service
definition; `DATA_DISCORD_BOT_TOKEN` and `DATA_DISCORD_APPLICATION_ID` come from
`/root/.zo_secrets`. Optional: `DATA_DISCORD_OWNER_IDS`, `DATA_DISCORD_CHANNEL_IDS`,
`DATA_HTTP_TOKEN`, `DATA_DISCORD_BOT_USER_ID`, `DATA_DISCORD_GATEWAY_URL`,
`DATA_DISCORD_API_BASE`. Values are never
recorded here, and the identifiers (guild, channel, role, owner, application, bot user)
are deliberately absent from this public repository — they live in the service
definition and in `/root/.zo_secrets`.

## Two prerequisites that live outside this repository

1. **Message Content** must be enabled for the Data application
   (Developer Portal → Bot → Privileged Gateway Intents). Without it Discord rejects the
   gateway connection with close code `4014`, and no mention carries readable text.
2. The application must be installed in the server with the `bot` and
   `applications.commands` scopes.

The bridge logs a specific line for each: on a `4014` close it prints
"enable Message Content Intent for the Data application ... then this process connects on
its next attempt" and retries every five minutes instead of hot-looping; when READY
reports `guilds=[]` it prints "READY reports no guilds: invite the Data application to the
server with the bot scope".

## Recreation

```sh
# register once, then let .github/workflows/deploy.yml keep it current
# mode process, workdir as above
DATA_DISCORD_BOT_TOKEN=<token> DATA_DISCORD_APPLICATION_ID=<app id> \
DATA_DISCORD_GUILD_IDS=<guild> DATA_DISCORD_ROLE_IDS=<role> \
bun run ./index.ts
```

## Verification

- 2026-09-23 — all four workspace checkouts clean; registered as `svc__FQ0NilRSiI` and started.
  It connects, reads its secrets, and then reports `4014 (disallowed intent(s))` with the
  exact fix, backing off 300s rather than hot-looping: the channel is deployed and waiting
  on the Message Content toggle, which is the only thing that keeps it from answering.
- 2026-09-23 — the mention → `data-http` → reply loop was proven against a stub Gateway,
  a stub Discord REST API, and a stub `data-http`: the bridge identified, read a mention
  from a role-holding author, asked the ingress with `session=discord:<channel>`, posted
  the answer back as a reply, and showed a typing indicator while it worked.
