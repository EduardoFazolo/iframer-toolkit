/** Normalize any thrown value to a string message. */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
