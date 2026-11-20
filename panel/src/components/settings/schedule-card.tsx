import { useId, useState } from "react";
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
  FieldLabel,
} from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import { Spinner } from "@zsrobinson/shell/ui/spinner";
import { Switch } from "@zsrobinson/shell/ui/switch";

import { useControlMutation } from "@/lib/mutations";
import { describeUtcTime, isTime, utcToLocal } from "@/lib/schedule";
import type { Schedule, Server } from "@/lib/types";

type Slot = { on: boolean; time: string };
const slot = (value: string | null | undefined, fallback: string): Slot => ({
  on: Boolean(value),
  time: value ?? fallback,
});
const toValue = (value: Slot) => (value.on ? value.time : null);

/**
 * Restart: off or a daily UTC time. Backup: inherit the shared nightly job
 * (null) or run at this server's own time instead, never both.
 */
export function ScheduleCard({ server }: { server: Server }) {
  const nightly =
    server.effectiveSchedule?.backupSource === "global"
      ? (server.effectiveSchedule.backupAt ?? null)
      : null;
  const [restart, setRestart] = useState(() =>
    slot(server.schedule?.restartAt, "05:00"),
  );
  const [backup, setBackup] = useState(() =>
    slot(server.schedule?.backupAt, nightly ?? "04:30"),
  );
  const save = useControlMutation<Schedule, unknown>("schedule", server.name, {
    success: "Schedule saved",
  });
  const next = { restartAt: toValue(restart), backupAt: toValue(backup) };
  const dirty =
    next.restartAt !== (server.schedule?.restartAt ?? null) ||
    next.backupAt !== (server.schedule?.backupAt ?? null);
  const valid = [restart, backup].every(
    (item) => !item.on || isTime(item.time),
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Schedule</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        <ScheduleRow
          label="Daily restart"
          offText="Off"
          value={restart}
          onChange={setRestart}
        />
        <ScheduleRow
          label="Own backup time"
          offText={
            nightly
              ? `Nightly default, ${describeUtcTime(nightly)}`
              : "Nightly default"
          }
          value={backup}
          onChange={setBackup}
        />
      </CardContent>
      <CardFooter>
        <Button
          variant="outline"
          disabled={!dirty || !valid || save.isPending}
          onClick={() => save.mutate(next)}
        >
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          Save schedule
        </Button>
      </CardFooter>
    </Card>
  );
}

function ScheduleRow({
  label,
  offText,
  value,
  onChange,
}: {
  label: string;
  offText: string;
  value: Slot;
  onChange: (value: Slot) => void;
}) {
  const switchId = useId();
  const timeId = useId();
  return (
    <div className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={switchId}>{label}</FieldLabel>
          <FieldDescription>
            {value.on && isTime(value.time)
              ? `${utcToLocal(value.time)} your time`
              : value.on
                ? "Choose a time"
                : offText}
          </FieldDescription>
        </FieldContent>
        <Switch
          id={switchId}
          checked={value.on}
          onCheckedChange={(on) => onChange({ ...value, on })}
        />
      </Field>
      {value.on ? (
        <div className="flex items-center gap-2">
          <label htmlFor={timeId} className="sr-only">
            {label}, UTC
          </label>
          <Input
            id={timeId}
            type="time"
            className="w-36"
            value={value.time}
            onChange={(event) =>
              onChange({ ...value, time: event.target.value })
            }
          />
          <span className="text-sm text-muted-foreground">UTC</span>
        </div>
      ) : null}
    </div>
  );
}
