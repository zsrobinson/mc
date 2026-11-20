export * from "@zsrobinson/shell/lib/format";
export type PlayerCount = { online: number; max: number; names: string[] };

const LIST_PATTERN =
  /There are (\d+) (?:of a max of|\/) ?(\d+) players online:?\s*(.*)/i;

/** Parse the RCON `list` reply. Returns null when the text is not a list. */
export function parsePlayers(text: string | null): PlayerCount | null {
  if (!text) return null;
  const match = LIST_PATTERN.exec(text.trim());
  if (!match) return null;
  const names = match[3]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return { online: Number(match[1]), max: Number(match[2]), names };
}

const ACRONYMS = new Set(["nas", "nfs", "smb", "s3", "ssd", "hdd", "usb"]);

/**
 * A readable label for a storage location id. Display names from the control
 * service (anything with a capital letter) pass through unchanged.
 */
export function locationLabel(id: string) {
  if (/[A-Z ]/.test(id)) return id;
  return id
    .split(/[-_.]/)
    .filter(Boolean)
    .map((word) =>
      ACRONYMS.has(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}
