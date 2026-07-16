export interface ConcurrencyGate {
  run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

export function createConcurrencyGate(limit: number): ConcurrencyGate {
  assertLimit(limit);
  let active = 0;
  const waiters: Array<() => void> = [];

  const release = () => {
    active -= 1;
    waiters.shift()?.();
  };

  return {
    async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      signal?.throwIfAborted();
      if (active >= limit) {
        await new Promise<void>((resolve, reject) => {
          const ready = () => {
            signal?.removeEventListener("abort", aborted);
            resolve();
          };
          const aborted = () => {
            const index = waiters.indexOf(ready);
            if (index >= 0) waiters.splice(index, 1);
            reject(signal?.reason);
          };
          waiters.push(ready);
          signal?.addEventListener("abort", aborted, { once: true });
        });
      }
      signal?.throwIfAborted();
      active += 1;
      try {
        return await work();
      } finally {
        release();
      }
    }
  };
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  worker: (value: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  const gate = createConcurrencyGate(limit);
  return Promise.all(values.map((value, index) => gate.run(() => worker(value, index), signal)));
}

function assertLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("Concurrency limit must be a positive integer.");
}
