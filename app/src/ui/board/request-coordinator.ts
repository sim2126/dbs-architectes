/** Serialise writes to each row and reject reads overtaken by a write. */
export class BoardRequestCoordinator {
  private rows = new Map<string, Promise<unknown>>();
  private generation = 0;

  enqueue<T>(id: string, write: () => Promise<T>): Promise<T> {
    this.generation++;
    const previous = this.rows.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(write);
    this.rows.set(id, next);
    void next.finally(() => {
      if (this.rows.get(id) === next) this.rows.delete(id);
    }).catch(() => undefined);
    return next;
  }

  async whenIdle(): Promise<void> {
    while (this.rows.size > 0) await Promise.allSettled([...this.rows.values()]);
  }

  readVersion(): number { return this.generation; }

  canApplyRead(version: number): boolean {
    return this.rows.size === 0 && version === this.generation;
  }
}
