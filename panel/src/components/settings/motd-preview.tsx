import { cn } from "@zsrobinson/shell/lib/utils";
import { parseMotd } from "@/lib/motd";

/**
 * The message of the day as the multiplayer list shows it. The surface is
 * always dark, like the game's, so Minecraft's bright colours stay legible
 * in both themes.
 */
export function MotdPreview({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const runs = parseMotd(value);
  return (
    <div
      className={cn(
        "rounded-xl bg-[var(--flexoki-black)] px-3 py-2 font-mono text-sm leading-5 whitespace-pre-wrap break-words text-[#AAAAAA] ring-1 ring-foreground/10",
        className,
      )}
      aria-label="Message of the day preview"
      role="img"
    >
      {runs.length ? (
        runs.map((run, index) => (
          <span
            key={index}
            style={{ color: run.style.colour }}
            className={cn(
              run.style.bold && "font-bold",
              run.style.italic && "italic",
              run.style.underline && "underline",
              run.style.strike && "line-through",
              run.style.underline &&
                run.style.strike &&
                "[text-decoration-line:underline_line-through]",
              run.style.obfuscated && "blur-[2px]",
            )}
          >
            {run.text}
          </span>
        ))
      ) : (
        <span className="text-[#777777]">A Minecraft Server</span>
      )}
    </div>
  );
}
