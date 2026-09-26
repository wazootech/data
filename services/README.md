# Services

Durable records of the long-running processes that make Data reachable, separate
from the automations that govern its files. These records exist so the runtime can
be rebuilt if the Zo host is lost, and so this repository shows what Data actually
runs as rather than only what it contains.

One file per service. Each record holds the Zo service ID, label, mode, entrypoint,
working directory, environment variable names (never their values), and the
process the record was verified against.

## Inventory

| Service | Mode | Purpose | File |
| --- | --- | --- | --- |
| `data-discord` | `process` | Holds the Gateway connection as the Data application and turns each admitted mention into a question for Data's Zo persona | `discord.md` |

`data-http` ran from 2026-09-25 to 2026-09-26 and is retired. Its record is kept at
`archives/letta-brain/services/http-api.md`, with the reason, alongside the rest of
the Letta runtime that Data no longer runs.

## Maintenance rules

- Record environment variable names only, never values. Secrets live in Zo secrets
  at `/root/.zo_secrets` and are loaded by the service at startup.
- Record the entrypoint verbatim, including the working directory, so the service
  can be recreated exactly.
- Note the observed process start time and log paths when a record is verified, and
  date the verification.
- When a service is retired, keep its record rather than deleting it, move it to
  `archives/` with the reason and the verification date, and drop it from the
  inventory above so the table only ever lists what Data runs now.
