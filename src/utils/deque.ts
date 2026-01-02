/**
 * Simple Deque (Double-ended queue) implementation
 *
 * Provides O(1) push/pop operations at both ends.
 * Uses a ring buffer approach with array resizing when needed.
 */
export class Deque<T> {
  private buffer: (T | undefined)[];
  private head: number = 0;
  private tail: number = 0;
  private _length: number = 0;

  constructor(initialCapacity: number = 16) {
    this.buffer = new Array(initialCapacity);
  }

  /**
   * Number of items in the deque
   */
  get length(): number {
    return this._length;
  }

  /**
   * Check if deque is empty
   */
  isEmpty(): boolean {
    return this._length === 0;
  }

  /**
   * Add item to the back (like Array.push)
   */
  pushBack(item: T): void {
    if (this._length === this.buffer.length) {
      this.resize();
    }
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.buffer.length;
    this._length++;
  }

  /**
   * Add item to the front (like Array.unshift)
   */
  pushFront(item: T): void {
    if (this._length === this.buffer.length) {
      this.resize();
    }
    this.head = (this.head - 1 + this.buffer.length) % this.buffer.length;
    this.buffer[this.head] = item;
    this._length++;
  }

  /**
   * Remove and return item from front (like Array.shift) - O(1)
   */
  popFront(): T | undefined {
    if (this._length === 0) {
      return undefined;
    }
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined; // Help GC
    this.head = (this.head + 1) % this.buffer.length;
    this._length--;
    return item;
  }

  /**
   * Remove and return item from back (like Array.pop)
   */
  popBack(): T | undefined {
    if (this._length === 0) {
      return undefined;
    }
    this.tail = (this.tail - 1 + this.buffer.length) % this.buffer.length;
    const item = this.buffer[this.tail];
    this.buffer[this.tail] = undefined; // Help GC
    this._length--;
    return item;
  }

  /**
   * Peek at front item without removing
   */
  peekFront(): T | undefined {
    if (this._length === 0) {
      return undefined;
    }
    return this.buffer[this.head];
  }

  /**
   * Peek at back item without removing
   */
  peekBack(): T | undefined {
    if (this._length === 0) {
      return undefined;
    }
    const idx = (this.tail - 1 + this.buffer.length) % this.buffer.length;
    return this.buffer[idx];
  }

  /**
   * Convert to array (for iteration)
   */
  toArray(): T[] {
    const result: T[] = [];
    let idx = this.head;
    for (let i = 0; i < this._length; i++) {
      result.push(this.buffer[idx] as T);
      idx = (idx + 1) % this.buffer.length;
    }
    return result;
  }

  /**
   * Create from array
   */
  static fromArray<T>(items: T[]): Deque<T> {
    const deque = new Deque<T>(Math.max(16, items.length * 2));
    for (const item of items) {
      deque.pushBack(item);
    }
    return deque;
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.buffer = new Array(16);
    this.head = 0;
    this.tail = 0;
    this._length = 0;
  }

  /**
   * Filter items (returns new deque)
   */
  filter(predicate: (item: T) => boolean): Deque<T> {
    return Deque.fromArray(this.toArray().filter(predicate));
  }

  /**
   * Double the buffer capacity
   */
  private resize(): void {
    const newBuffer: (T | undefined)[] = new Array(this.buffer.length * 2);
    let idx = this.head;
    for (let i = 0; i < this._length; i++) {
      newBuffer[i] = this.buffer[idx];
      idx = (idx + 1) % this.buffer.length;
    }
    this.buffer = newBuffer;
    this.head = 0;
    this.tail = this._length;
  }
}
