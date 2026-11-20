/** Shared policy for data APIs and archive exports. server.properties is separately redacted. */
export function secretPath(path: string) {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .some(
      (part) =>
        part === ".env" ||
        part.toLowerCase().endsWith(".env") ||
        /(^|\.)env\./i.test(part) ||
        /^\.?rcon-cli\./i.test(part) ||
        /rcon|secret|credential|token|password|private.?key/i.test(part) ||
        part === ".git",
    );
}
