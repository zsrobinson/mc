import { ApiError, control } from "./api";
import type { IntentAction } from "./types";

type Intent = { token: string; action: IntentAction; expiresAt: string };

const isIntentRequired = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 409 &&
  error.code === "intent-required";

/**
 * Run a destructive verb with a fresh single-use confirmation token. A token
 * that expired or was already spent is replaced once; a second refusal is
 * reported in words the person can act on.
 */
export async function withIntent<T>(
  name: string,
  action: IntentAction,
  run: (intent: string) => Promise<T>,
): Promise<T> {
  const issue = () =>
    control<Intent>("confirm-intent", name, { action }).then((i) => i.token);
  try {
    return await run(await issue());
  } catch (error) {
    if (!isIntentRequired(error)) throw error;
    try {
      return await run(await issue());
    } catch (retry) {
      if (isIntentRequired(retry))
        throw new ApiError(
          "The confirmation expired before it reached the server. Type the name and confirm again.",
          409,
          "intent-required",
        );
      throw retry;
    }
  }
}
