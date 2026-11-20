export type ProjectKind = "mod" | "datapack";

export const KIND_LABEL: Record<ProjectKind, { one: string; many: string }> = {
  mod: { one: "mod", many: "Mods" },
  datapack: { one: "datapack", many: "Datapacks" },
};

export const configKey = (kind: ProjectKind) =>
  kind === "mod" ? ("mods" as const) : ("datapacks" as const);
