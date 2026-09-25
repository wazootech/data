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
| `data-http` | `http` | Serves Data's HTTP surface: `GET /health` and `POST /ask`, routing questions into Data's self-hosted Letta agent | `http-api.md` |

## Maintenance rules

- Record environment variable names only, never values. Secrets live in Zo secrets
  at `/root/.zo_secrets` and are loaded by the service at startup.
- Record the entrypoint verbatim, including the working directory, so the service
  can be recreated exactly.
- Note the observed process start time and log paths when a record is verified, and
  date the verification.
- When a service is retired, keep its record and mark it retired rather than
  deleting it.
