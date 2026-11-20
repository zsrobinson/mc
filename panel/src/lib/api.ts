import { ApiError, parseJson as parse } from "@zsrobinson/shell/lib/api";
export { ApiError, getJson, errorMessage } from "@zsrobinson/shell/lib/api";

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
