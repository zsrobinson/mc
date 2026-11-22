/** Past-tense labels for activity entries, by helper verb. */
const VERBS: Record<string, string> = {
  start: "Started server",
  stop: "Stopped server",
  restart: "Restarted server",
  kill: "Force-stopped server",
  "crash-detected": "Crashed",
  "create-server": "Created server",
  "delete-server": "Deleted server",
  "rename-server": "Renamed server",
  "backup-now": "Backed up",
  "restore-backup": "Restored a backup",
  "restore-test": "Tested a restore",
  "pin-backup": "Changed a backup pin",
  "download-backup": "Downloaded a backup",
  "reset-world": "Reset the world",
  "upload-world": "Replaced the world",
  "download-world": "Downloaded the world",
  "upload-file": "Uploaded a file",
  "download-file": "Downloaded a file",
  "download-log": "Downloaded a log",
  "write-file": "Edited a file",
  "delete-file": "Deleted a file",
  "make-directory": "Created a folder",
  "rename-file": "Renamed a file",
  "archive-files": "Compressed files",
  "extract-archive": "Extracted an archive",
  "apply-config": "Changed configuration",
  "apply-properties": "Changed game settings",
  "set-loader": "Changed the Fabric loader",
  "upload-icon": "Changed the icon",
  "upload-datapack": "Uploaded a datapack",
  "player-action": "Managed players",
  rcon: "Ran a console command",
  schedule: "Changed the schedule",
  "save-task": "Saved a scheduled task",
  "delete-task": "Deleted a scheduled task",
  "run-task": "Ran a scheduled task",
  "fix-dns": "Fixed DNS",
};

export function verbLabel(verb: string) {
  if (VERBS[verb]) return VERBS[verb];
  const words = verb.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ACTORS: Record<string, string> = {
  schedule: "Schedule",
  timer: "Nightly timer",
  cli: "Command line",
  monitor: "Monitor",
};

/** People appear as their email; automated actors get a readable name. */
export const actorLabel = (actor: string) => ACTORS[actor] ?? actor;
export const isPerson = (actor: string) => actor.includes("@");
