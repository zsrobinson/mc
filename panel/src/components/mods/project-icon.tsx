import { useState } from "react";
import { cn } from "cn";

/** A project's Modrinth icon, served same-site; initials when missing. */
export function ProjectIcon({
  title,
  iconUrl,
  className,
}: {
  title: string;
  iconUrl?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-sm font-medium text-muted-foreground",
        className,
      )}
    >
      {iconUrl && !failed ? (
        <img
          src={iconUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        title.charAt(0).toUpperCase()
      )}
    </span>
  );
}
