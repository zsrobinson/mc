import { cn } from "@zsrobinson/shell/lib/utils";
import type { Advanced } from "./advanced-fields";

export type TemplateId =
  "survival" | "creative" | "hardcore" | "peaceful" | "custom";

type Template = {
  id: TemplateId;
  label: string;
  summary: string;
  values: Pick<Advanced, "gamemode" | "difficulty" | "hardcore" | "levelType">;
};

/** Starting points that fill the game fields; everything stays editable. */
export const TEMPLATES: Template[] = [
  {
    id: "survival",
    label: "Survival",
    summary: "Normal difficulty, default world",
    values: {
      gamemode: "",
      difficulty: "normal",
      hardcore: false,
      levelType: "",
    },
  },
  {
    id: "creative",
    label: "Creative",
    summary: "Superflat, peaceful, unlimited blocks",
    values: {
      gamemode: "creative",
      difficulty: "peaceful",
      hardcore: false,
      levelType: "flat",
    },
  },
  {
    id: "hardcore",
    label: "Hardcore",
    summary: "Hard, one life per player",
    values: { gamemode: "", difficulty: "hard", hardcore: true, levelType: "" },
  },
  {
    id: "peaceful",
    label: "Peaceful",
    summary: "Survival without hostile mobs",
    values: {
      gamemode: "",
      difficulty: "peaceful",
      hardcore: false,
      levelType: "",
    },
  },
  {
    id: "custom",
    label: "Custom",
    summary: "Choose every option yourself",
    values: { gamemode: "", difficulty: "", hardcore: false, levelType: "" },
  },
];

export function TemplatePicker({
  value,
  onChange,
  disabled,
}: {
  value: TemplateId;
  onChange: (template: Template) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Template"
      className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5"
    >
      {TEMPLATES.map((template) => (
        <label
          key={template.id}
          className={cn(
            "flex cursor-pointer flex-col gap-0.5 rounded-2xl border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/30",
            value === template.id &&
              "border-primary bg-primary/5 hover:bg-primary/5",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <input
            type="radio"
            name="server-template"
            value={template.id}
            className="sr-only"
            disabled={disabled}
            checked={value === template.id}
            onChange={() => onChange(template)}
          />
          <span className="font-medium">{template.label}</span>
          <span className="text-muted-foreground">{template.summary}</span>
        </label>
      ))}
    </div>
  );
}
