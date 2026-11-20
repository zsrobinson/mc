import { useQuery } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@zsrobinson/shell/ui/badge";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
} from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Spinner } from "@zsrobinson/shell/ui/spinner";
import { Textarea } from "@zsrobinson/shell/ui/textarea";

import { downloadUrl } from "@/lib/api";
import { useControlMutation } from "@/lib/mutations";
import { fileQuery } from "@/lib/queries";
import { isSecretPath } from "@/lib/secret-files";
import { QueryError } from "../query-error";
import { PathCrumbs } from "./path-crumbs";
import { parentOf } from "./file-browser";

export function FileEditor({ name, path }: { name: string; path: string }) {
  const hidden = isSecretPath(path);
  const file = useQuery({ ...fileQuery(name, path), enabled: !hidden });
  if (hidden)
    return (
      <QueryError
        title="This file is not available here"
        error={
          new Error("Secret files cannot be viewed or edited in the panel.")
        }
      />
    );
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex min-h-8 min-w-0 items-center">
          <PathCrumbs name={name} path={path} />
        </div>
        <CardAction className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            render={
              <a href={downloadUrl("download-file", name, { path })} download />
            }
            nativeButton={false}
          >
            <DownloadIcon data-icon="inline-start" />
            Download
          </Button>
        </CardAction>
      </CardHeader>
      {file.isPending ? (
        <CardContent>
          <Skeleton className="h-[50vh] w-full" />
        </CardContent>
      ) : file.isError ? (
        <CardContent className="flex flex-col gap-3">
          <QueryError
            title="This file cannot be edited here"
            error={file.error}
          />
          <Button
            variant="outline"
            className="self-start"
            render={
              <Link
                to="/servers/$name/files"
                params={{ name }}
                search={{ path: parentOf(path) }}
              />
            }
            nativeButton={false}
          >
            Back to folder
          </Button>
        </CardContent>
      ) : (
        <EditorBody
          key={file.dataUpdatedAt}
          name={name}
          path={path}
          initial={file.data.text}
        />
      )}
    </Card>
  );
}

function EditorBody({
  name,
  path,
  initial,
}: {
  name: string;
  path: string;
  initial: string;
}) {
  const [text, setText] = useState(initial);
  const dirty = text !== initial;
  const save = useControlMutation<
    { path: string; text: string; confirm: true },
    unknown
  >("write-file", name, { success: "Saved" });

  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm("Discard unsaved changes?"),
    enableBeforeUnload: dirty,
  });

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty) save.mutate({ path, text, confirm: true });
      }}
    >
      <CardContent>
        <Textarea
          aria-label={`Contents of ${path}`}
          spellCheck={false}
          className="h-[55vh] min-h-72 resize-y font-mono text-xs leading-5"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "s") {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
      </CardContent>
      <CardFooter className="gap-2">
        <Button type="submit" disabled={!dirty || save.isPending}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          Save
        </Button>
        <Button
          variant="outline"
          render={
            <Link
              to="/servers/$name/files"
              params={{ name }}
              search={{ path: parentOf(path) }}
            />
          }
          nativeButton={false}
        >
          Close
        </Button>
        {dirty ? (
          <Badge variant="secondary" className="ml-auto">
            Unsaved changes
          </Badge>
        ) : null}
      </CardFooter>
    </form>
  );
}
