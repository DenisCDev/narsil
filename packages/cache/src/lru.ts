/**
 * Narsil LRU Cache
 *
 * Lightweight in-memory LRU cache for serverless environments.
 * Used for rate limiting, response caching, and request deduplication.
 */

interface LRUEntry<T> {
  value: T;
  expiry: number;
  prev: string | null;
  next: string | null;
}

export class LRUCache<T = unknown> {
  private cache = new Map<string, LRUEntry<T>>();
  private head: string | null = null;
  private tail: string | null = null;
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check expiry
    if (entry.expiry > 0 && Date.now() > entry.expiry) {
      this.delete(key);
      return undefined;
    }

    // Move to front (most recently used)
    this.moveToFront(key);
    return entry.value;
  }

  set(key: string, value: T, ttlSeconds = 0): void {
    // Delete existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Evict LRU entry if at capacity
    if (this.cache.size >= this.maxSize && this.tail) {
      this.delete(this.tail);
    }

    const expiry = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0;

    const entry: LRUEntry<T> = {
      value,
      expiry,
      prev: null,
      next: this.head,
    };

    // Add to front of list
    if (this.head) {
      const headEntry = this.cache.get(this.head);
      if (headEntry) headEntry.prev = key;
    }

    this.head = key;
    if (!this.tail) this.tail = key;

    this.cache.set(key, entry);
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Remove from linked list
    if (entry.prev) {
      const prevEntry = this.cache.get(entry.prev);
      if (prevEntry) prevEntry.next = entry.next;
    } else {
      this.head = entry.next;
    }

    if (entry.next) {
      const nextEntry = this.cache.get(entry.next);
      if (nextEntry) nextEntry.prev = entry.prev;
    } else {
      this.tail = entry.prev;
    }

    this.cache.delete(key);
    return true;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiry > 0 && Date.now() > entry.expiry) {
      this.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  get size(): number {
    return this.cache.size;
  }

  private moveToFront(key: string): void {
    if (this.head === key) return;

    const entry = this.cache.get(key);
    if (!entry) return;

    // Remove from current position
    if (entry.prev) {
      const prevEntry = this.cache.get(entry.prev);
      if (prevEntry) prevEntry.next = entry.next;
    }
    if (entry.next) {
      const nextEntry = this.cache.get(entry.next);
      if (nextEntry) nextEntry.prev = entry.prev;
    }
    if (this.tail === key) {
      this.tail = entry.prev;
    }

    // Move to front
    entry.prev = null;
    entry.next = this.head;
    if (this.head) {
      const headEntry = this.cache.get(this.head);
      if (headEntry) headEntry.prev = key;
    }
    this.head = key;
  }
}
