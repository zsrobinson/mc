import { CardFooter } from "@zsrobinson/shell/ui/card";
import { useState } from "react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@zsrobinson/shell/ui/native-select";
import { Spinner } from "@zsrobinson/shell/ui/spinner";
import { Switch } from "@zsrobinson/shell/ui/switch";

import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";
import {
  fieldError,
  PROPERTY_FIELDS,
  toPayload,
  type PropertyField,
} from "./property-fields";
import { useApplyProperties } from "./use-apply-properties";

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

export function PropertiesForm({
  name,
  initial,
}: {
  name: string;
  initial: Record<string, string>;
}) {
  const [values, setValues] = useState(initial);
  const apply = useApplyProperties(name);
  const fields = PROPERTY_FIELDS.filter((field) => field.key in initial);
  const changed = fields
    .map((field) => field.key)
    .filter((key) => values[key] !== initial[key]);
  const invalid = fields.some((field) =>
    fieldError(field, values[field.key] ?? ""),
  );
  const set = (key: string, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const text = fields.filter((field) => field.type !== "switch");
  const switches = fields.filter((field) => field.type === "switch");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
        {text.map((field) => (
          <PropertyInput
            key={field.key}
            field={field}
            value={values[field.key] ?? ""}
            onChange={(value) => set(field.key, value)}
          />
        ))}
      </div>
      <div className="flex flex-col divide-y rounded-2xl border">
        {switches.map((field) => (
          <Field key={field.key} orientation="horizontal" className="px-4 py-3">
            <FieldContent>
              <FieldLabel htmlFor={`property-${field.key}`}>
                {field.label}
              </FieldLabel>
              {field.type === "switch" && field.description ? (
                <FieldDescription>{field.description}</FieldDescription>
              ) : null}
            </FieldContent>
            <Switch
              id={`property-${field.key}`}
              checked={values[field.key] === "true"}
              onCheckedChange={(on) => set(field.key, String(on))}
            />
          </Field>
        ))}
      </div>
      <CardFooter className="flex flex-wrap items-center gap-2 px-0 pt-4">
        <ConfirmAction
          trigger={
            <Button
              disabled={changed.length === 0 || invalid || apply.isPending}
            >
              {apply.isPending ? <Spinner data-icon="inline-start" /> : null}
              Save
            </Button>
          }
          title="Apply and restart?"
          confirmLabel="Back up and restart"
          onConfirm={() =>
            apply.mutateAsync({
              values: toPayload(values, changed),
              confirm: true,
            })
          }
        >
          {changed.length === 1
            ? "1 setting changes"
            : `${changed.length} settings change`}
          . The server is backed up, then restarts with the new settings.
        </ConfirmAction>
        <Button
          variant="ghost"
          disabled={changed.length === 0 || apply.isPending}
          onClick={() => setValues(initial)}
        >
          Reset
        </Button>
        {changed.length > 0 ? (
          <span className="text-sm text-muted-foreground">
            {changed.length} unsaved
          </span>
        ) : null}
      </CardFooter>
    </div>
  );
}

function PropertyInput({
  field,
  value,
  onChange,
}: {
  field: PropertyField;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `property-${field.key}`;
  const error = fieldError(field, value);
  return (
    <Field
      data-invalid={error ? true : undefined}
      className={field.key === "motd" ? "sm:col-span-2" : undefined}
    >
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      {field.type === "select" ? (
        <NativeSelect
          id={id}
          className="w-full"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {(field.options.includes(value)
            ? field.options
            : [value, ...field.options]
          ).map((option) => (
            <NativeSelectOption key={option} value={option}>
              {capitalize(option)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : (
        <Input
          id={id}
          type={field.type === "number" ? "number" : "text"}
          inputMode={field.type === "number" ? "numeric" : undefined}
          min={field.type === "number" ? field.min : undefined}
          max={field.type === "number" ? field.max : undefined}
          maxLength={field.type === "text" ? field.maxLength : undefined}
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
