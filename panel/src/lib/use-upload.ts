import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@zsrobinson/shell";

import { errorMessage, upload, type UploadVerb } from "./api";
import { refreshServer } from "./mutations";

type Variables = { file: File; params?: Record<string, string | undefined> };

/** A raw-body upload with progress, toasts and cache refresh. */
export function useUpload(
  verb: UploadVerb,
  name: string,
  success: (file: File) => string,
) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const mutation = useMutation({
    mutationKey: ["upload", verb, name],
    mutationFn: ({ file, params }: Variables) => {
      setProgress(0);
      return upload<unknown>(verb, name, file, params, setProgress);
    },
    onSuccess: (_, { file }) => toast.success(success(file)),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => refreshServer(queryClient, name),
  });
  return { ...mutation, progress };
}

export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
