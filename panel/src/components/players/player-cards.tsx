import { useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import { Field, FieldLabel } from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import { ItemGroup } from "@zsrobinson/shell/ui/item";
import { Spinner } from "@zsrobinson/shell/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@zsrobinson/shell/ui/tabs";

import type { Players } from "@/lib/types";
import { formatDateTime, formatRelative, parseTime } from "@/lib/format";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";
import { PlayerForm } from "./player-form";
import { EmptyList, ListRow } from "@zsrobinson/shell/blocks/list-row";
import { IP_ADDRESS, PLAYER_NAME, usePlayerAction } from "./use-player-action";

type CardProps = { name: string; players: Players };

export function OnlineCard({ name, players }: CardProps) {
  const queryClient = useQueryClient();
  const action = usePlayerAction(name);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Online{" "}
          <span className="ml-1 font-normal text-muted-foreground">
            {players.online.length}
          </span>
        </CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void queryClient.invalidateQueries({
                queryKey: ["server", name, "players"],
              })
            }
          >
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {players.online.length === 0 ? (
          <EmptyList>No players online</EmptyList>
        ) : (
          <ItemGroup>
            {players.online.map((player) => (
              <ListRow key={player} name={player}>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={action.isPendingFor("kick", player)}
                  onClick={() => action.mutate({ action: "kick", player })}
                >
                  {action.isPendingFor("kick", player) ? <Spinner /> : null}
                  Kick
                </Button>
              </ListRow>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}

export function WhitelistCard({ name, players }: CardProps) {
  const action = usePlayerAction(name);
  const toggling =
    action.isPendingFor("whitelist-on") || action.isPendingFor("whitelist-off");
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Whitelist{" "}
          <span className="ml-1 font-normal text-muted-foreground">
            {players.whitelist.length}
          </span>
        </CardTitle>
        <CardAction>
          <Button
            size="sm"
            variant="ghost"
            disabled={toggling}
            onClick={() =>
              action.mutate({
                action: players.whitelistEnabled
                  ? "whitelist-off"
                  : "whitelist-on",
              })
            }
          >
            {players.whitelistEnabled ? "Disable" : "Enable"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <PlayerForm
          label="Player to whitelist"
          submitLabel="Add"
          pending={
            action.isPending && action.variables?.action === "whitelist-add"
          }
          onSubmit={(player) =>
            action.mutateAsync({ action: "whitelist-add", player })
          }
        />
        {players.whitelist.length === 0 ? (
          <EmptyList>Nobody is whitelisted</EmptyList>
        ) : (
          <ItemGroup>
            {players.whitelist.map((player) => (
              <ListRow key={player.uuid || player.name} name={player.name}>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={action.isPendingFor(
                    "whitelist-remove",
                    player.name,
                  )}
                  onClick={() =>
                    action.mutate({
                      action: "whitelist-remove",
                      player: player.name,
                    })
                  }
                >
                  Remove
                </Button>
              </ListRow>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}

export function OperatorsCard({ name, players }: CardProps) {
  const action = usePlayerAction(name);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Operators</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <PlayerForm
          label="Player to make operator"
          submitLabel="Make operator"
          pending={action.isPending && action.variables?.action === "op"}
          onSubmit={(player) => action.mutateAsync({ action: "op", player })}
        />
        {players.ops.length === 0 ? (
          <EmptyList>No operators</EmptyList>
        ) : (
          <ItemGroup>
            {players.ops.map((player) => (
              <ListRow
                key={player.uuid || player.name}
                name={player.name}
                detail={player.level ? `Level ${player.level}` : undefined}
              >
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={action.isPendingFor("deop", player.name)}
                  onClick={() =>
                    action.mutate({ action: "deop", player: player.name })
                  }
                >
                  Remove
                </Button>
              </ListRow>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}

export function BansCard({ name, players }: CardProps) {
  const action = usePlayerAction(name);
  const [kind, setKind] = useState<"player" | "ip">("player");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const targetId = useId();
  const reasonId = useId();
  const valid = (kind === "player" ? PLAYER_NAME : IP_ADDRESS).test(
    target.trim(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bans</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <Tabs
            value={kind}
            onValueChange={(v) => {
              setKind(v as "player" | "ip");
              setTarget("");
            }}
          >
            <TabsList>
              <TabsTrigger value="player">Player</TabsTrigger>
              <TabsTrigger value="ip">IP address</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={targetId}>
                {kind === "player" ? "Player" : "IP address"}
              </FieldLabel>
              <Input
                id={targetId}
                autoComplete="off"
                spellCheck={false}
                value={target}
                aria-invalid={target !== "" && !valid ? true : undefined}
                onChange={(event) => setTarget(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={reasonId}>Reason</FieldLabel>
              <Input
                id={reasonId}
                placeholder="Optional"
                maxLength={200}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </div>
          {target.trim() ? (
            <ConfirmAction
              trigger={
                <Button
                  variant="destructive"
                  className="self-start"
                  disabled={!valid}
                >
                  Ban
                </Button>
              }
              title={`Ban ${target.trim()}?`}
              confirmLabel="Ban"
              destructive
              onConfirm={async () => {
                await action.mutateAsync({
                  action: kind === "player" ? "ban" : "ban-ip",
                  player: target.trim(),
                  reason: reason.trim() || undefined,
                });
                setTarget("");
                setReason("");
              }}
            >
              {kind === "player"
                ? "They are disconnected and cannot join until unbanned."
                : "Every player from this address is disconnected and blocked."}
            </ConfirmAction>
          ) : null}
        </div>
        <BanList
          title="Banned players"
          entries={players.bannedPlayers.map((ban) => ({
            key: ban.uuid || ban.name,
            label: ban.name,
            detail: <BanDetail ban={ban} />,
          }))}
          pendingFor={(label) => action.isPendingFor("pardon", label)}
          onPardon={(label) =>
            action.mutate({ action: "pardon", player: label })
          }
        />
        <BanList
          title="Banned IP addresses"
          entries={players.bannedIps.map((ban) => ({
            key: ban.ip,
            label: ban.ip,
            detail: <BanDetail ban={ban} />,
          }))}
          pendingFor={(label) => action.isPendingFor("pardon-ip", label)}
          onPardon={(label) =>
            action.mutate({ action: "pardon-ip", player: label })
          }
        />
      </CardContent>
    </Card>
  );
}

function BanList({
  title,
  entries,
  pendingFor,
  onPardon,
}: {
  title: string;
  entries: { key: string; label: string; detail?: ReactNode }[];
  pendingFor: (label: string) => boolean;
  onPardon: (label: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {entries.length === 0 ? (
        <EmptyList>None</EmptyList>
      ) : (
        <ItemGroup>
          {entries.map((entry) => (
            <ListRow
              key={entry.key}
              name={entry.label}
              detail={entry.detail}
              wrapDetail
            >
              <Button
                size="xs"
                variant="ghost"
                disabled={pendingFor(entry.label)}
                onClick={() => onPardon(entry.label)}
              >
                Unban
              </Button>
            </ListRow>
          ))}
        </ItemGroup>
      )}
    </section>
  );
}

/**
 * Reason, when it was made and when it ends. Minecraft writes these dates as
 * "2026-11-20 12:00:00 +0000", which parseTime reads in every browser.
 */
function BanDetail({
  ban,
}: {
  ban: { reason?: string; created?: string; expires?: string };
}) {
  const [now] = useState(() => Date.now());
  const created = ban.created ? parseTime(ban.created) : NaN;
  const expires =
    ban.expires && ban.expires !== "forever" ? parseTime(ban.expires) : NaN;
  const parts: ReactNode[] = [];
  if (ban.reason) parts.push(<span key="reason">{ban.reason}</span>);
  if (Number.isFinite(created))
    parts.push(
      <span key="created" title={formatDateTime(created)}>
        Banned {formatRelative(created, now)}
      </span>,
    );
  if (Number.isFinite(expires))
    parts.push(
      <span key="expires" title={formatDateTime(expires)}>
        {expires > now ? "ends" : "ended"} {formatRelative(expires, now)}
      </span>,
    );
  else if (ban.expires === "forever")
    parts.push(<span key="expires">permanent</span>);
  return parts.length ? (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 ? " · " : null}
          {part}
        </span>
      ))}
    </>
  ) : null;
}
