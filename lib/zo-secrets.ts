/**
 * Reads Zo's secret file for a service that started without a shell.
 *
 * A Zo-managed service is spawned by supervisord with a bare environment, so
 * anything a program needs has to be read from `/root/.zo_secrets` itself. The
 * file is a list of `export NAME=value` lines.
 *
 * One trap makes this worth a module of its own: the service environment is not
 * empty. Zo injects `ZO_CLIENT_IDENTITY_TOKEN`, and a loader that bails out
 * whenever that token is present leaves every other secret unset — which shows
 * up much later as `Provider is not configured: openrouter` on the first turn
 * instead of a startup error. So selecting names and selecting missing names are
 * separate decisions here, and the callers test both.
 */

/** Parses `export NAME=value` lines, unquoting values and ignoring everything else. */
export function parseZoSecrets(content: string): Map<string, string> {
  const secrets = new Map<string, string>();
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("export ")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice("export ".length, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key.length === 0) continue;
    secrets.set(key, value);
  }
  return secrets;
}

/**
 * The secrets in `secrets` that `env` does not already have, optionally narrowed
 * to `names`. A value the process already carries always wins, so an injected
 * secret is never clobbered by the file.
 */
export function missingSecrets(
  secrets: Map<string, string>,
  env: NodeJS.ProcessEnv,
  names?: readonly string[],
): Record<string, string> {
  const wanted = names === undefined ? undefined : new Set(names);
  const missing: Record<string, string> = {};
  for (const [key, value] of secrets) {
    if (wanted !== undefined && !wanted.has(key)) continue;
    if (env[key]) continue;
    missing[key] = value;
  }
  return missing;
}
