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

`DATA_PERSONA_ID`, and optionally `DATA_HTTP_TOKEN`, `DATA_MODEL_NAME`,
`ZO_API_BASE`, `PORT`. `ZO_CLIENT_IDENTITY_TOKEN` is read from `/root/.zo_secrets` when
the process starts without it, because managed services do not inherit the host shell
environment. Values are never recorded here.

## Recreation

```sh
# register once, then let .github/workflows/deploy.yml keep it current
# mode http, private, local port 8788, workdir as above
DATA_PERSONA_ID=<persona id> bun run ./index.ts
```

## Verification

- 2026-09-23 — registered and started; `GET /health` returned `ok: true` with the
  persona id, and `POST /ask` returned an answer citing `README.md` and `AGENTS.md` from
  this repository. Workdir was the development worktree at registration and was
  re-pointed to the live checkout in this repository once the change landed on `main`.
