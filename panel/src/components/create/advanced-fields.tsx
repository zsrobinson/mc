import { useQuery } from "@tanstack/react-query";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@zsrobinson/shell/ui/native-select";

import { versionsQuery } from "@/lib/queries";
import type { Limits, Server } from "@/lib/types";

/** Empty strings mean "let the control service decide". */
export type Advanced = {
  version: string;
  memory: string;
  port: string;
  seed: string;
  gamemode: string;
  difficulty: string;
};

export const EMPTY_ADVANCED: Advanced = {
  version: "",
  memory: "",
  port: "",
  seed: "",
  gamemode: "",
  difficulty: "",
};

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
  const versions = useQuery(versionsQuery);
  const set = (key: keyof Advanced) => (next: string) =>
    onChange({ ...value, [key]: next });

  return (
    <div id={id} className="grid gap-5 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="server-version">Minecraft version</FieldLabel>
        <NativeSelect
          id="server-version"
          className="w-full"
          disabled={disabled || !versions.data}
          value={value.version}
          onChange={(event) => set("version")(event.target.value)}
        >
          <NativeSelectOption value="">
            {versions.data?.[0]
              ? `Newest (${versions.data[0]})`
              : "Newest release"}
          </NativeSelectOption>
          {versions.data?.slice(1).map((version) => (
            <NativeSelectOption key={version} value={version}>
              {version}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
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
