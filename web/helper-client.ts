import { request } from "node:http";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
export function helperResponse(
  path: string,
  method: string,
  body?: ReadableStream<Uint8Array> | null,
  type = "application/octet-stream",
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: process.env.HELPER_SOCKET!,
        path,
        method,
        headers: {
          Authorization:
            "Bearer " +
            readFileSync(process.env.HELPER_SECRET_FILE!, "utf8").trim(),
          "Content-Type": type,
        },
      },
      (res) => {
        const headers = new Headers();
        for (const key of [
          "content-type",
          "content-disposition",
          "cache-control",
        ]) {
          const value = res.headers[key];
          if (typeof value === "string") headers.set(key, value);
        }
        resolve(
          new Response(Readable.toWeb(res) as ReadableStream, {
            status: res.statusCode ?? 502,
            headers,
          }),
        );
      },
    );
    req.setTimeout(1_200_000, () =>
      req.destroy(Error("Control transfer timed out")),
    );
    req.on("error", reject);
    if (body)
      Readable.fromWeb(body as import("node:stream/web").ReadableStream)
        .on("error", (e) => req.destroy(e))
        .pipe(req);
    else req.end();
  });
}
