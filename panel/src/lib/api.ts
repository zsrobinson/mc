/** A failed API call, carrying the HTTP status and the server's message. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON bodies come from proxies; fall through to a status message.
  }
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export async function getJson<T>(url: string, signal?: AbortSignal) {
  return parse<T>(await fetch(url, { signal }));
}

export async function control<T>(
  verb: string,
  name?: string,
  payload?: object,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verb, name, payload: payload ?? {} }),
    signal,
  });
  return parse<T>(response);
}

type Params = Record<string, string | undefined>;

function query(params: Params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) search.set(key, value);
  return search.toString();
}

export type DownloadVerb =
  "download-file" | "download-world" | "download-backup" | "download-log";

/** A same-origin URL for an anchor; the browser streams the file. */
export function downloadUrl(verb: DownloadVerb, name: string, params = {}) {
  return `/api/download?${query({ verb, name, ...params })}`;
}

export type UploadVerb = "upload-file" | "upload-world" | "upload-icon";

/**
 * Send a file as the raw request body. XHR rather than fetch so large
 * uploads can report progress.
 */
export function upload<T>(
  verb: UploadVerb,
  name: string,
  file: File,
  params: Params = {},
  onProgress?: (fraction: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/upload?${query({ verb, name, ...params })}`);
    request.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onerror = () =>
      reject(new ApiError("Upload failed. Check the connection.", 0));
    request.onload = () => {
      parse<T>(
        new Response(request.responseText || null, { status: request.status }),
      ).then(resolve, reject);
    };
    request.send(file);
  });
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}
