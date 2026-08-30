/**
 * Shared notification utilities.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? (error as Error).message : String(error);
}
