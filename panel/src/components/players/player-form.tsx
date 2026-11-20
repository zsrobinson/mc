import { useId, useState } from "react";
import { Button } from "@zsrobinson/shell/ui/button";
import { Input } from "@zsrobinson/shell/ui/input";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

/** One-field add form: a player name (or IP) and a submit button. */
export function PlayerForm({
  label,
  submitLabel,
  pattern = /^[A-Za-z0-9_]{3,16}$/,
  placeholder = "Player name",
  pending,
  onSubmit,
}: {
  label: string;
  submitLabel: string;
  pattern?: RegExp;
  placeholder?: string;
  pending: boolean;
  onSubmit: (value: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState("");
  const id = useId();
  const valid = pattern.test(value.trim());

  return (
    <form
      className="flex gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!valid || pending) return;
        try {
          await onSubmit(value.trim());
          setValue("");
        } catch {
          // Reported by the mutation toast; keep the typed value.
        }
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input
        id={id}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        aria-invalid={value !== "" && !valid ? true : undefined}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="submit" variant="outline" disabled={!valid || pending}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {submitLabel}
      </Button>
    </form>
  );
}
