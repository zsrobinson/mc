import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageStack, PageTitle } from "@zsrobinson/shell";

import { FileBrowser } from "@/components/files/file-browser";
import { FileEditor } from "@/components/files/file-editor";

type FilesSearch = { path: string; file?: string };

const clean = (value: unknown) =>
  typeof value === "string" ? value.replace(/^\/+|\/+$/g, "") : "";

export const Route = createFileRoute("/servers/$name/files")({
  staticData: { crumb: "Files" },
  validateSearch: (search: Record<string, unknown>): FilesSearch => ({
    path: clean(search.path),
    file: clean(search.file) || undefined,
  }),
  component: FilesPage,
});

function FilesPage() {
  const { name } = Route.useParams();
  const { path, file } = Route.useSearch();
  return (
    <PageStack>
      {file ? (
        <>
          <PageHeader>
            <PageTitle>Files</PageTitle>
          </PageHeader>
          <FileEditor key={file} name={name} path={file} />
        </>
      ) : (
        // A new folder starts with nothing selected.
        <FileBrowser key={path} name={name} path={path} />
      )}
    </PageStack>
  );
}
