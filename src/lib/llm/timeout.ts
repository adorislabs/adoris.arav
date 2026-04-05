/**
 * Wraps any promise with a hard timeout.
 * If the promise doesn't resolve/reject within `ms` milliseconds,
 * the returned promise rejects with a descriptive error.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'LLM call'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}
