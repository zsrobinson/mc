import { useQueryClient } from "@tanstack/react-query";
import { useUpload as useShellUpload } from "@zsrobinson/shell/lib/use-upload";
import { upload, type UploadVerb } from "./api";
import { refreshServer } from "./mutations";
export { MAX_UPLOAD_BYTES } from "@zsrobinson/shell/lib/use-upload";

export function useUpload(
  verb: UploadVerb,
  name: string,
  success: (file: File) => string,
) {
  const queryClient = useQueryClient();
  return useShellUpload({
    mutationKey: ["upload", verb, name],
    upload: ({ file, params }, progress) =>
      upload(verb, name, file, params, progress),
    success,
    onSettled: () => refreshServer(queryClient, name),
  });
}
