import {
  Field,
  FieldDescription,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import { Switch } from "@zsrobinson/shell/ui/switch";
import {
  NativeSelect,
  NativeSelectOption,
} from "@zsrobinson/shell/ui/native-select";

import type { Limits, Server } from "@/lib/types";

/** Empty strings mean "let the control service decide". */
export type Advanced = {
  version: string;
  memory: string;
  port: string;
  seed: string;
  gamemode: string;
  difficulty: string;
  hardcore: boolean;
  levelType: LevelType | "";
};

export type LevelType = "normal" | "flat" | "large_biomes" | "amplified";

export const EMPTY_ADVANCED: Advanced = {
  version: "",
  memory: "",
  port: "",
  seed: "",
  gamemode: "",
  difficulty: "",
  hardcore: false,
  levelType: "",
};

const LEVEL_TYPES: { value: LevelType; label: string }[] = [
  { value: "normal", label: "Default" },
  { value: "flat", label: "Superflat" },
  { value: "large_biomes", label: "Large biomes" },
  { value: "amplified", label: "Amplified" },
];

const GAMEMODES = ["survival", "creative", "adventure", "spectator"];
const DIFFICULTIES = ["peaceful", "easy", "normal", "hard"];
const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

type Context = {
  limits?: Limits;
  servers?: Server[];
  maxHeap?: number;
};

export function advancedErrors(value: Advanced, context: Context) {
  const memory = value.memory.trim();
  const port = value.port.trim();
  const memoryNumber = Number(memory);
  const portNumber = Number(port);
  return {
    memory: !memory
      ? null
      : !Number.isInteger(memoryNumber) || memoryNumber < 512
        ? "At least 512 MiB"
        : context.maxHeap !== undefined && memoryNumber > context.maxHeap
          ? `At most ${context.maxHeap} MiB fits the shared budget`
          : null,
    port: !port
      ? null
      : !Number.isInteger(portNumber) ||
          (context.limits &&
            (portNumber < context.limits.portMin ||
              portNumber > context.limits.portMax))
        ? context.limits
          ? `Between ${context.limits.portMin} and ${context.limits.portMax}`
          : "Enter a port number"
        : context.servers?.some((server) => server.port === portNumber)
          ? "Another server uses this port"
          : null,
  };
}

/** Only the fields the person set; everything else uses server defaults. */
export function advancedPayload(value: Advanced) {
  return {
    ...(value.version ? { version: value.version } : {}),
    ...(value.memory.trim() ? { memory: Number(value.memory) } : {}),
    ...(value.port.trim() ? { port: Number(value.port) } : {}),
    ...(value.seed.trim() ? { seed: value.seed.trim() } : {}),
    ...(value.gamemode ? { gamemode: value.gamemode } : {}),
    ...(value.difficulty ? { difficulty: value.difficulty } : {}),
    ...(value.hardcore ? { hardcore: true } : {}),
    ...(value.levelType ? { levelType: value.levelType } : {}),
  };
}

export function AdvancedFields({
  id,
  value,
  onChange,
  errors,
  limits,
  disabled,
  memoryHint,
}: {
  id: string;
  value: Advanced;
  onChange: (value: Advanced) => void;
  errors: ReturnType<typeof advancedErrors>;
  limits?: Limits;
  disabled: boolean;
  memoryHint?: string;
}) {
  const set = (key: Exclude<keyof Advanced, "hardcore">) => (next: string) =>
    onChange({ ...value, [key]: next });

  return (
    <div id={id} className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="server-seed">Seed</FieldLabel>
        <Input
          id="server-seed"
          placeholder="Random"
          autoComplete="off"
          maxLength={64}
          disabled={disabled}
          value={value.seed}
          onChange={(event) => set("seed")(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="server-gamemode">Game mode</FieldLabel>
        <NativeSelect
          id="server-gamemode"
          className="w-full"
          disabled={disabled}
          value={value.gamemode}
          onChange={(event) => set("gamemode")(event.target.value)}
        >
          <NativeSelectOption value="">Survival (default)</NativeSelectOption>
          {GAMEMODES.slice(1).map((mode) => (
            <NativeSelectOption key={mode} value={mode}>
              {capitalize(mode)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="server-difficulty">Difficulty</FieldLabel>
        <NativeSelect
          id="server-difficulty"
          className="w-full"
          disabled={disabled}
          value={value.difficulty}
          onChange={(event) => set("difficulty")(event.target.value)}
        >
          <NativeSelectOption value="">Default</NativeSelectOption>
          {DIFFICULTIES.map((difficulty) => (
            <NativeSelectOption key={difficulty} value={difficulty}>
              {capitalize(difficulty)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="server-level-type">World type</FieldLabel>
        <NativeSelect
          id="server-level-type"
          className="w-full"
          disabled={disabled}
          value={value.levelType}
          onChange={(event) => set("levelType")(event.target.value)}
        >
          <NativeSelectOption value="">Default</NativeSelectOption>
          {LEVEL_TYPES.slice(1).map((type) => (
            <NativeSelectOption key={type.value} value={type.value}>
              {type.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field orientation="horizontal" className="self-end">
        <FieldContent>
          <FieldLabel htmlFor="server-hardcore">Hardcore</FieldLabel>
          <FieldDescription>
            One life; hard difficulty is locked.
          </FieldDescription>
        </FieldContent>
        <Switch
          id="server-hardcore"
          disabled={disabled}
          checked={value.hardcore}
          onCheckedChange={(hardcore) => onChange({ ...value, hardcore })}
        />
      </Field>
      <Field data-invalid={errors.memory ? true : undefined}>
        <FieldLabel htmlFor="server-memory">Heap memory (MiB)</FieldLabel>
        <Input
          id="server-memory"
          type="number"
          inputMode="numeric"
          min={512}
          step={256}
          placeholder="Automatic"
          disabled={disabled}
          aria-invalid={errors.memory ? true : undefined}
          value={value.memory}
          onChange={(event) => set("memory")(event.target.value)}
        />
        {errors.memory ? (
          <FieldError>{errors.memory}</FieldError>
        ) : memoryHint ? (
          <FieldDescription>{memoryHint}</FieldDescription>
        ) : null}
      </Field>
      <Field data-invalid={errors.port ? true : undefined}>
        <FieldLabel htmlFor="server-port">Game port</FieldLabel>
        <Input
          id="server-port"
          type="number"
          inputMode="numeric"
          placeholder="Automatic"
          min={limits?.portMin}
          max={limits?.portMax}
          disabled={disabled}
          aria-invalid={errors.port ? true : undefined}
          value={value.port}
          onChange={(event) => set("port")(event.target.value)}
        />
        {errors.port ? (
          <FieldError>{errors.port}</FieldError>
        ) : limits ? (
          <FieldDescription>
            {limits.portMin}–{limits.portMax}
          </FieldDescription>
        ) : null}
      </Field>
    </div>
  );
}
