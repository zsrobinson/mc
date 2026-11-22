/** Minecraft's § formatting codes, for previewing a message of the day. */
export const MOTD_COLOURS: Record<string, string> = {
  "0": "#000000",
  "1": "#0000AA",
  "2": "#00AA00",
  "3": "#00AAAA",
  "4": "#AA0000",
  "5": "#AA00AA",
  "6": "#FFAA00",
  "7": "#AAAAAA",
  "8": "#555555",
  "9": "#5555FF",
  a: "#55FF55",
  b: "#55FFFF",
  c: "#FF5555",
  d: "#FF55FF",
  e: "#FFFF55",
  f: "#FFFFFF",
};

export type MotdStyle = {
  colour?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  obfuscated?: boolean;
};

export type MotdRun = { text: string; style: MotdStyle };

/**
 * Split a MOTD into styled runs. Accepts the § sign and the § escape
 * server.properties may contain; `\n` starts the second line.
 */
export function parseMotd(value: string): MotdRun[] {
  const text = value.replace(/\\u00a7/gi, "§").replace(/\\n/g, "\n");
  const runs: MotdRun[] = [];
  let style: MotdStyle = {};
  let buffer = "";
  const flush = () => {
    if (buffer) runs.push({ text: buffer, style });
    buffer = "";
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = text[i + 1]?.toLowerCase();
    if (char !== "§" || code === undefined) {
      buffer += char;
      continue;
    }
    i++;
    flush();
    if (code in MOTD_COLOURS) style = { colour: MOTD_COLOURS[code] };
    else if (code === "l") style = { ...style, bold: true };
    else if (code === "o") style = { ...style, italic: true };
    else if (code === "n") style = { ...style, underline: true };
    else if (code === "m") style = { ...style, strike: true };
    else if (code === "k") style = { ...style, obfuscated: true };
    else if (code === "r") style = {};
  }
  flush();
  return runs;
}

/** The text players read, without formatting codes. */
export const plainMotd = (value: string) =>
  parseMotd(value)
    .map((run) => run.text)
    .join("");
