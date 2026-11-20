import { useControlMutation } from "@/lib/mutations";

type Payload = {
  values?: Record<string, string | number | boolean>;
  raw?: string;
  confirm: true;
};

export function useApplyProperties(name: string) {
  return useControlMutation<Payload, unknown>("apply-properties", name, {
    success: "Settings applied and server restarted",
  });
}
