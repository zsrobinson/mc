import { useCallback, useRef, useState } from "react";

const LIMIT = 50;

function load(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter((x) => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/** Shell-style command recall with ArrowUp and ArrowDown, kept per server. */
export function useCommandHistory(name: string) {
  const key = `mc-console-history:${name}`;
  const [history, setHistory] = useState(() => load(key));
  const cursor = useRef<number | null>(null);

  const push = useCallback(
    (command: string) => {
      cursor.current = null;
      setHistory((previous) => {
        const next = [
          ...previous.filter((item) => item !== command),
          command,
        ].slice(-LIMIT);
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // History is a convenience; ignore storage failures.
        }
        return next;
      });
    },
    [key],
  );

  /** Returns the command to show, or undefined to leave the input alone. */
  const step = useCallback(
    (direction: -1 | 1) => {
      if (history.length === 0) return undefined;
      const from = cursor.current ?? history.length;
      const to = Math.min(history.length, Math.max(0, from + direction));
      cursor.current = to === history.length ? null : to;
      return to === history.length ? "" : history[to];
    },
    [history],
  );

  return { push, step };
}
