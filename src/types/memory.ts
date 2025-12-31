/**
 * Memory system types for persistent learning
 * Adapted from Memorai memory patterns
 */

import type { MemoryCategory } from './protocol.ts';

/** Stored memory entry */
export interface Memory {
  id: string;
  category: MemoryCategory;
  content: string;
  summary?: string;
  importance: number;
  tags: string[];
  createdAt: string;
  expiresAt?: string;
  sourceTask?: number;
  sourceAgent?: string;
}

/** Memory query options */
export interface MemoryQuery {
  query?: string;
  categories?: MemoryCategory[];
  minImportance?: number;
  tags?: string[];
  limit?: number;
  includeExpired?: boolean;
}

/** Search result with relevance score */
export interface MemorySearchResult {
  memory: Memory;
  relevance: number; // 0-100 based on BM25/LIKE score
}

/** Memory store interface */
export interface IMemoryStore {
  store(memory: Omit<Memory, 'id' | 'createdAt'>): Promise<Memory>;
  search(query: MemoryQuery): Promise<MemorySearchResult[]>;
  getByCategory(category: MemoryCategory, limit?: number): Promise<Memory[]>;
  getRecent(limit?: number): Promise<Memory[]>;
  delete(id: string): Promise<void>;
  prune(): Promise<number>;
}
