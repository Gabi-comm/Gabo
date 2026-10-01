import { rememberHost } from "./backend";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function split(host: string): [name: string, port: string] {
  const i = host.lastIndexOf(":");
  return i > host.lastIndexOf("]") ? [host.slice(0, i), host.slice(i + 1)] : [host, ""];
}

/**
 * The API runs tools on Gab's machine, so only requests from a local page on the same port pass.
 * The Host check stops DNS rebinding; the Origin check stops other sites posting cross-origin.
 */
export function rejectForeign(req: Request): Response | null {
  const [hostName, hostPort] = split(req.headers.get("host") ?? "");
  if (!LOCAL_HOSTS.has(hostName)) return new Response("Forbidden host", { status: 403 });
  rememberHost(`${hostName}:${hostPort}`);
  const origin = req.headers.get("origin");
  if (!origin) return null;
  try {
    const o = new URL(origin);
    if (LOCAL_HOSTS.has(o.hostname === "::1" ? "[::1]" : o.hostname) && o.port === hostPort) return null;
  } catch { /* fall through */ }
  return new Response("Forbidden origin", { status: 403 });
}
