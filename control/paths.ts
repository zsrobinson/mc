import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
/** Pin an inode before reading it; parent symlink swaps cannot escape the data root. */
export async function secureOpen(
  root: string,
  path: string,
  directory = false,
) {
  const allowed = await realpath(root);
  const handle = await open(
    path,
    constants.O_RDONLY |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK |
      (directory ? constants.O_DIRECTORY : 0),
  );
  try {
    const actual = await realpath("/proc/self/fd/" + handle.fd);
    if (actual !== allowed && !actual.startsWith(allowed + "/"))
      throw Error("Path outside server data");
    const info = await handle.stat();
    if (directory ? !info.isDirectory() : !info.isFile())
      throw Error("Unexpected file type");
    return handle;
  } catch (e) {
    await handle.close();
    throw e;
  }
}
