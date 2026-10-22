/**
 * PGlite runs on a single connection: two overlapping `BEGIN` blocks would interleave
 * statements. This promise-chain mutex serialises transactions in that mode only.
 * Real Postgres (pg Pool) is fully concurrent and never takes this path.
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export const pgliteTxMutex = new Mutex();
