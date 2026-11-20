/**
 * Files the panel never lists, opens or downloads, even if a control service
 * returns them: RCON client config, environment files and helper secrets.
 */
const SECRET = [
  /^\.rcon-cli\./i,
  /^\.env(?:\..*)?$/i,
  /\.env$/i,
  /helper-secret/i,
  /\.secret$/i,
];

export function isSecretPath(path: string) {
  return path
    .split("/")
    .some((part) => SECRET.some((pattern) => pattern.test(part)));
}
