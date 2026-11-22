import { useId, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@zsrobinson/shell/ui/native-select";
import { Spinner } from "@zsrobinson/shell/ui/spinner";
import { Switch } from "@zsrobinson/shell/ui/switch";
import { Textarea } from "@zsrobinson/shell/ui/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@zsrobinson/shell/ui/toggle-group";
import { cn } from "@zsrobinson/shell/lib/utils";
import { useControlMutation } from "@/lib/mutations";
import {
  describeDays,
  isTime,
  KIND_LABELS,
  utcToLocal,
  viewerIsUtc,
  WEEKDAY_NAMES,
  WEEKDAYS,
} from "@/lib/schedule";
import {
  WARN_MINUTES,
  type Task,
  type TaskInput,
  type TaskKind,
  type WarnMinutes,
} from "@/lib/types";

const KINDS: { kind: TaskKind; hint: string }[] = [
  { kind: "restart", hint: "Save, stop and start again" },
  { kind: "backup", hint: "A snapshot on every destination" },
  { kind: "command", hint: "One console command" },
  { kind: "announce", hint: "A chat message to everyone online" },
];

type Draft = {
  kind: TaskKind;
  time: string;
  days: number[];
  enabled: boolean;
  command: string;
  message: string;
  warnMinutes: WarnMinutes;
};

const draftOf = (task?: Task): Draft => ({
  kind: task?.kind ?? "restart",
  time: task?.time ?? "05:00",
  days: task?.days ?? [],
  enabled: task?.enabled ?? true,
  command: task?.command ?? "",
  message: task?.message ?? "",
  warnMinutes: task?.warnMinutes ?? 5,
});

function errorsOf(draft: Draft) {
  const command = draft.command.trim();
  const message = draft.message.trim();
  return {
    time: isTime(draft.time) ? null : "Enter a time as HH:MM",
    command:
      draft.kind !== "command"
        ? null
        : !command
          ? "Enter a command"
          : command.startsWith("/")
            ? "Leave out the leading slash"
            : /[\r\n]/.test(command)
              ? "One line only"
              : command.length > 200
                ? "200 characters at most"
                : null,
    message:
      draft.kind !== "announce"
        ? null
        : !message
          ? "Enter a message"
          : message.length > 200
            ? "200 characters at most"
            : null,
  };
}

function toPayload(draft: Draft, id?: string): TaskInput {
  return {
    ...(id ? { id } : {}),
    kind: draft.kind,
    time: draft.time,
    days: [...draft.days].sort(),
    enabled: draft.enabled,
    ...(draft.kind === "command" ? { command: draft.command.trim() } : {}),
    ...(draft.kind === "announce" ? { message: draft.message.trim() } : {}),
    ...(draft.kind === "restart" ? { warnMinutes: draft.warnMinutes } : {}),
  };
}

function daysSentence(days: number[]) {
  const label = describeDays(days);
  if (label === "Every day") return "Runs every day.";
  if (label === "Weekdays" || label === "Weekends")
    return `Runs on ${label.toLowerCase()}.`;
  return `Runs on ${label}.`;
}

/** Create or edit one scheduled task on its own page. */
export function TaskForm({
  name,
  task,
  extraActions,
}: {
  name: string;
  task?: Task;
  /** Run now and delete, on the edit page. */
  extraActions?: ReactNode;
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => draftOf(task));
  const [submitted, setSubmitted] = useState(false);
  const errors = errorsOf(draft);
  const valid = Object.values(errors).every((error) => !error);
  const show = (key: keyof typeof errors) =>
    (submitted || key === "time") && errors[key];
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const ids = {
    time: useId(),
    command: useId(),
    message: useId(),
    warn: useId(),
    enabled: useId(),
  };
  const save = useControlMutation<{ task: TaskInput }, Task>(
    "save-task",
    name,
    {
      success: task ? "Task saved" : "Task created",
      onSuccess: () =>
        void navigate({ to: "/servers/$name/schedules", params: { name } }),
    },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{task ? KIND_LABELS[task.kind] : "Task"}</CardTitle>
      </CardHeader>
      <form
        className="contents"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!valid || save.isPending) return;
          save.mutate({ task: toPayload(draft, task?.id) });
        }}
      >
        <CardContent>
          <FieldGroup className="gap-6">
            <FieldSet>
              <FieldLegend variant="label">What it does</FieldLegend>
              <div
                role="radiogroup"
                aria-label="Task kind"
                className="grid gap-2 sm:grid-cols-2"
              >
                {KINDS.map(({ kind, hint }) => (
                  <label
                    key={kind}
                    className={cn(
                      "flex cursor-pointer flex-col gap-0.5 rounded-2xl border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/30",
                      draft.kind === kind &&
                        "border-primary bg-primary/5 hover:bg-primary/5",
                      task && "cursor-default",
                    )}
                  >
                    <input
                      type="radio"
                      name="task-kind"
                      value={kind}
                      className="sr-only"
                      checked={draft.kind === kind}
                      disabled={Boolean(task) && draft.kind !== kind}
                      onChange={() => set("kind", kind)}
                    />
                    <span className="font-medium">{KIND_LABELS[kind]}</span>
                    <span className="text-muted-foreground">{hint}</span>
                  </label>
                ))}
              </div>
              {task ? (
                <FieldDescription>
                  To change what a task does, create a new one.
                </FieldDescription>
              ) : null}
            </FieldSet>

            {draft.kind === "command" ? (
              <Field data-invalid={show("command") ? true : undefined}>
                <FieldLabel htmlFor={ids.command}>Command</FieldLabel>
                <Input
                  id={ids.command}
                  className="font-mono"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={200}
                  placeholder="save-all flush"
                  aria-invalid={show("command") ? true : undefined}
                  value={draft.command}
                  onChange={(event) => set("command", event.target.value)}
                />
                {show("command") ? (
                  <FieldError>{errors.command}</FieldError>
                ) : (
                  <FieldDescription>
                    Runs as the server console, without a leading slash.
                  </FieldDescription>
                )}
              </Field>
            ) : null}

            {draft.kind === "announce" ? (
              <Field data-invalid={show("message") ? true : undefined}>
                <FieldLabel htmlFor={ids.message}>Message</FieldLabel>
                <Textarea
                  id={ids.message}
                  rows={2}
                  maxLength={200}
                  aria-invalid={show("message") ? true : undefined}
                  value={draft.message}
                  onChange={(event) =>
                    set("message", event.target.value.replace(/\n/g, " "))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                {show("message") ? (
                  <FieldError>{errors.message}</FieldError>
                ) : (
                  <FieldDescription>
                    Sent with <span className="font-mono">say</span> ·{" "}
                    {draft.message.trim().length}/200
                  </FieldDescription>
                )}
              </Field>
            ) : null}

            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={show("time") ? true : undefined}>
                <FieldLabel htmlFor={ids.time}>Time (UTC)</FieldLabel>
                <Input
                  id={ids.time}
                  type="time"
                  className="w-36"
                  required
                  aria-invalid={show("time") ? true : undefined}
                  value={draft.time}
                  onChange={(event) => set("time", event.target.value)}
                />
                {show("time") ? (
                  <FieldError>{errors.time}</FieldError>
                ) : (
                  <FieldDescription>
                    {viewerIsUtc()
                      ? "Your clock is on UTC."
                      : `${utcToLocal(draft.time)} your time`}
                  </FieldDescription>
                )}
              </Field>
              {draft.kind === "restart" ? (
                <Field>
                  <FieldLabel htmlFor={ids.warn}>Warn players</FieldLabel>
                  <NativeSelect
                    id={ids.warn}
                    className="w-full"
                    value={String(draft.warnMinutes)}
                    onChange={(event) =>
                      set(
                        "warnMinutes",
                        Number(event.target.value) as WarnMinutes,
                      )
                    }
                  >
                    {WARN_MINUTES.map((minutes) => (
                      <NativeSelectOption key={minutes} value={minutes}>
                        {minutes === 0
                          ? "No warning"
                          : `${minutes} minute${minutes === 1 ? "" : "s"} before`}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <FieldDescription>
                    {draft.warnMinutes
                      ? "Chat counts down to the restart."
                      : "The restart begins without notice."}
                  </FieldDescription>
                </Field>
              ) : null}
            </div>

            <FieldSet>
              <FieldLegend variant="label">Days (UTC)</FieldLegend>
              <ToggleGroup
                multiple
                variant="outline"
                size="sm"
                spacing={1}
                className="flex-wrap"
                value={draft.days.map(String)}
                onValueChange={(value) =>
                  set(
                    "days",
                    (value as string[]).map(Number).sort((a, b) => a - b),
                  )
                }
              >
                {WEEKDAYS.map((day, index) => (
                  <ToggleGroupItem
                    key={day}
                    value={String(index)}
                    aria-label={WEEKDAY_NAMES[index]}
                    className="min-w-11"
                  >
                    {day}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>
                {draft.days.length === 0
                  ? "None selected: runs every day."
                  : daysSentence(draft.days)}
              </FieldDescription>
            </FieldSet>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={ids.enabled}>Enabled</FieldLabel>
                <FieldDescription>
                  Paused tasks keep their settings and do not run.
                </FieldDescription>
              </FieldContent>
              <Switch
                id={ids.enabled}
                checked={draft.enabled}
                onCheckedChange={(enabled) => set("enabled", enabled)}
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Spinner data-icon="inline-start" /> : null}
            {task ? "Save task" : "Create task"}
          </Button>
          <Button
            variant="outline"
            render={<Link to="/servers/$name/schedules" params={{ name }} />}
            nativeButton={false}
          >
            Cancel
          </Button>
          {extraActions ? (
            <span className="flex flex-wrap gap-2 sm:ml-auto">
              {extraActions}
            </span>
          ) : null}
        </CardFooter>
      </form>
    </Card>
  );
}
