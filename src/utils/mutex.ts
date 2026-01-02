/**
 * Async Mutex for Thread-Safe Operations
 *
 * Provides mutual exclusion for async operations in the TaskQueue
 * to prevent race conditions during parallel developer execution.
 */

export class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  /**
   * Acquire the mutex lock.
   * If already locked, waits in queue until released.
   */
  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    await new Promise<void>(resolve => this.queue.push(resolve));
  }

  /**
   * Release the mutex lock.
   * Resolves next waiting acquirer if any.
   */
  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }

  /**
   * Execute a function with mutex protection.
   * Automatically acquires and releases the lock.
   */
  async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Check if mutex is currently locked.
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Get number of waiters in queue.
   */
  getQueueLength(): number {
    return this.queue.length;
  }
}
