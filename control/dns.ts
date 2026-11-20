import { readFile } from "node:fs/promises";
export class Dns {
  constructor(
    readonly config?: {
      zoneId: string;
      tokenFile: string;
      joinDomain: string;
      target: string;
    },
  ) {}
  async ensure(name: string, port: number) {
    if (!this.config) return { configured: false };
    const { zoneId, tokenFile, joinDomain, target } = this.config;
    const token = (await readFile(tokenFile, "utf8")).trim();
    const record = "_minecraft._tcp." + name + "." + joinDomain;
    const base =
      "https://api.cloudflare.com/client/v4/zones/" +
      encodeURIComponent(zoneId) +
      "/dns_records";
    const headers = {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    };
    const get = await fetch(base + "?name=" + encodeURIComponent(record), {
      headers,
      signal: AbortSignal.timeout(30000),
    });
    if (!get.ok) throw Error("SRV lookup failed");
    const found = (await get.json()) as {
      success: boolean;
      result: { type: string; data: { port: number; target: string } }[];
    };
    if (!found.success) throw Error("SRV lookup failed");
    if (found.result.length) {
      if (
        found.result.length !== 1 ||
        found.result[0].type !== "SRV" ||
        found.result[0].data.port !== port ||
        found.result[0].data.target.replace(/\.$/, "") !== target
      )
        throw Error("An existing DNS record needs operator review");
      return { configured: true };
    }
    const r = await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: record,
        type: "SRV",
        ttl: 1,
        comment: "fleet minecraft",
        data: { priority: 0, weight: 0, port, target },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok || ((await r.json()) as { success: boolean }).success !== true)
      throw Error("SRV creation failed; server configuration retained");
    return { configured: true };
  }
}
