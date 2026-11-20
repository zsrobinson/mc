/** The server.properties keys offered as form fields, in display order. */
export type PropertyField =
  | { key: string; label: string; type: "text"; maxLength: number }
  | { key: string; label: string; type: "number"; min: number; max: number }
  | { key: string; label: string; type: "select"; options: string[] }
  | { key: string; label: string; type: "switch"; description?: string };

export const PROPERTY_FIELDS: PropertyField[] = [
  { key: "motd", label: "Message of the day", type: "text", maxLength: 59 },
  {
    key: "difficulty",
    label: "Difficulty",
    type: "select",
    options: ["peaceful", "easy", "normal", "hard"],
  },
  {
    key: "gamemode",
    label: "Game mode",
    type: "select",
    options: ["survival", "creative", "adventure", "spectator"],
  },
  {
    key: "max-players",
    label: "Max players",
    type: "number",
    min: 1,
    max: 500,
  },
  {
    key: "view-distance",
    label: "View distance",
    type: "number",
    min: 3,
    max: 32,
  },
  {
    key: "simulation-distance",
    label: "Simulation distance",
    type: "number",
    min: 3,
    max: 32,
  },
  {
    key: "spawn-protection",
    label: "Spawn protection",
    type: "number",
    min: 0,
    max: 64,
  },
  { key: "pvp", label: "PvP", type: "switch" },
  { key: "hardcore", label: "Hardcore", type: "switch" },
  { key: "allow-flight", label: "Allow flight", type: "switch" },
  { key: "enable-command-block", label: "Command blocks", type: "switch" },
  {
    key: "online-mode",
    label: "Online mode",
    type: "switch",
    description:
      "Verifies accounts with Mojang. Turning it off lets anyone join under any name.",
  },
];

export function fieldError(field: PropertyField, value: string) {
  if (field.type === "number") {
    const number = Number(value);
    if (value.trim() === "" || !Number.isInteger(number))
      return "Enter a whole number";
    if (number < field.min || number > field.max)
      return `Between ${field.min} and ${field.max}`;
  }
  if (field.type === "text" && value.length > field.maxLength)
    return `${field.maxLength} characters at most`;
  return null;
}

/** Form values as the API expects them: numbers and booleans typed. */
export function toPayload(values: Record<string, string>, keys: string[]) {
  const payload: Record<string, string | number | boolean> = {};
  for (const key of keys) {
    const field = PROPERTY_FIELDS.find((item) => item.key === key);
    const value = values[key];
    payload[key] =
      field?.type === "number"
        ? Number(value)
        : field?.type === "switch"
          ? value === "true"
          : value;
  }
  return payload;
}
