/** Thrown by withBudget when the wrapped call doesn't settle in time. */
export class BudgetExceededError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not answer within ${ms}ms`);
    this.name = "BudgetExceededError";
  }
}

/** Race a promise against a time budget. Page calls like evaluate/title have no
 *  timeout of their own, so against a tab whose JS stopped answering they hang
 *  forever — and take every safety check built on them down too. The original
 *  promise keeps running; its late rejection is swallowed. */
export function withBudget<T>(p: Promise<T>, ms: number, label = "page call"): Promise<T> {
  p.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new BudgetExceededError(label, ms)), ms);
      timer.unref?.();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
