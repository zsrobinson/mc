import { readFile, lstat } from "node:fs/promises";
import { nameSchema } from "./config";
export type DnsStatus = {
  status: "ok" | "missing" | "drifted" | "unconfigured";
  recordName: string;
  managed?: boolean;
};
type RecordValue = {
  id: string;
  name: string;
  type: string;
  comment?: string;
  data: { port: number; target: string; priority?: number; weight?: number };
};
export class Dns {
  static readonly tag = "managed-by: mc-helper";
  constructor(
    readonly config?: {
      zoneId: string;
      tokenFile: string;
      joinDomain: string;
      target: string;
      portMin?: number;
      portMax?: number;
    },
    readonly transport: typeof fetch = fetch,
  ) {}
  recordName(name: string) {
    nameSchema.parse(name);
    return this.config
      ? "_minecraft._tcp." + name + "." + this.config.joinDomain
      : "";
  }
  private async api<T>(
    suffix: string,
    data?: unknown,
    method?: string,
  ): Promise<T> {
    if (!this.config) throw Error("DNS integration is not configured");
    const info = await lstat(this.config.tokenFile);
    if (
      !info.isFile() ||
      (info.mode & 0o077) !== 0 ||
      ![0, process.getuid?.()].includes(info.uid)
    )
      throw Error("DNS token must be an owner-only file");
    const token = (await readFile(this.config.tokenFile, "utf8")).trim();
    if (token.length < 20) throw Error("DNS token is invalid");
    const response = await this.transport(
      "https://api.cloudflare.com/client/v4/zones/" +
        encodeURIComponent(this.config.zoneId) +
        "/dns_records" +
        suffix,
      {
        method: method ?? (data ? "POST" : "GET"),
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw Error("DNS provider request failed");
    const result = (await response.json()) as { success: boolean; result: T };
    if (!result.success) throw Error("DNS provider refused operation");
    return result.result;
  }
  private records(name: string) {
    return this.api<RecordValue[]>(
      "?name=" + encodeURIComponent(this.recordName(name)),
    );
  }
  private owns(record: RecordValue, name: string) {
    return (
      record.type === "SRV" &&
      record.name === this.recordName(name) &&
      record.comment === Dns.tag
    );
  }
  async available(name: string) {
    nameSchema.parse(name);
    if (!this.config) return;
    const records = await this.records(name);
    const base = await this.api<RecordValue[]>(
      "?name=" + encodeURIComponent(name + "." + this.config.joinDomain),
    );
    if (records.length || base.length)
      throw Error("Join hostname already exists");
  }
  async status(name: string, port: number): Promise<DnsStatus> {
    const recordName = this.recordName(name);
    if (!this.config) return { status: "unconfigured", recordName };
    const records = await this.records(name);
    if (!records.length)
      return { status: "missing", recordName, managed: false };
    const record = records[0];
    const managed = records.length === 1 && this.owns(record, name);
    const matches =
      managed &&
      record.data.port === port &&
      record.data.target.replace(/\.$/, "") === this.config.target &&
      Number(record.data.priority ?? 0) === 0 &&
      Number(record.data.weight ?? 0) === 0;
    return { status: matches ? "ok" : "drifted", recordName, managed };
  }
  async ensure(name: string, port: number) {
    nameSchema.parse(name);
    if (!this.config)
      return { status: "unconfigured" as const, recordName: "" };
    if (
      !Number.isInteger(port) ||
      port < (this.config.portMin ?? 1) ||
      port > (this.config.portMax ?? 65535)
    )
      throw Error("DNS port outside configured range");
    const recordName = this.recordName(name),
      records = await this.records(name);
    const value = {
      name: recordName,
      type: "SRV",
      ttl: 1,
      comment: Dns.tag,
      data: { priority: 0, weight: 0, port, target: this.config.target },
    };
    if (records.length) {
      if (records.length !== 1 || !this.owns(records[0], name))
        throw Error(
          "DNS record is not owned by mc-helper; operator review required",
        );
      if ((await this.status(name, port)).status === "ok")
        return this.status(name, port);
      await this.api("/" + encodeURIComponent(records[0].id), value, "PUT");
    } else await this.api("", value, "POST");
    return this.status(name, port);
  }
  async remove(name: string) {
    nameSchema.parse(name);
    if (!this.config) throw Error("DNS integration is not configured");
    const records = await this.records(name);
    if (!records.length) return { removed: false };
    if (records.length !== 1 || !this.owns(records[0], name))
      throw Error("DNS record is not owned by mc-helper; refusing deletion");
    await this.api(
      "/" + encodeURIComponent(records[0].id),
      undefined,
      "DELETE",
    );
    return { removed: true };
  }
}
