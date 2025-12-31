/**
 * Observation Store
 *
 * File-based storage for large observations to reduce context usage.
 * Instead of keeping large tool outputs in context, we store them on disk
 * and keep only a summary + filepath reference.
 *
 * This follows the Claude Code best practice:
 * "Use file system for long-term memory across sessions"
 * "Large observations can be saved outside the conversation"
 */

import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'crypto';

// ============================================
// TYPES
// ============================================

export interface Observation {
  key: string;
  summary: string;
  filepath: string;
  contentHash: string;
  size: number;
  timestamp: string;
  type: 'tool_output' | 'agent_output' | 'verification' | 'error' | 'custom';
  metadata?: Record<string, unknown>;
}

export interface ObservationIndex {
  observations: Record<string, Observation>;
  lastUpdated: string;
  totalSize: number;
}

// ============================================
// CONSTANTS
// ============================================

const OBSERVATIONS_DIR = 'observations';
const INDEX_FILE = 'index.json';
const SUMMARY_MAX_CHARS = 200;
const MAX_OBSERVATIONS = 100;
const MAX_TOTAL_SIZE_MB = 50;

// ============================================
// OBSERVATION STORE
// ============================================

export class ObservationStore {
  private storeDir: string;
  private indexPath: string;
  private index: ObservationIndex | null = null;

  constructor(workingDir: string) {
    this.storeDir = join(workingDir, '.autonoma', OBSERVATIONS_DIR);
    this.indexPath = join(this.storeDir, INDEX_FILE);
  }

  /**
   * Initialize the store directory
   */
  async init(): Promise<void> {
    await mkdir(this.storeDir, { recursive: true });
    await this.loadIndex();
  }

  /**
   * Load or create the index
   */
  private async loadIndex(): Promise<void> {
    if (existsSync(this.indexPath)) {
      try {
        const content = await readFile(this.indexPath, 'utf-8');
        this.index = JSON.parse(content);
      } catch {
        this.index = this.createEmptyIndex();
      }
    } else {
      this.index = this.createEmptyIndex();
    }
  }

  private createEmptyIndex(): ObservationIndex {
    return {
      observations: {},
      lastUpdated: new Date().toISOString(),
      totalSize: 0,
    };
  }

  /**
   * Save the index
   */
  private async saveIndex(): Promise<void> {
    if (!this.index) return;
    this.index.lastUpdated = new Date().toISOString();
    await writeFile(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
  }

  /**
   * Store a large observation and return summary + path
   */
  async store(
    key: string,
    content: string,
    type: Observation['type'] = 'custom',
    metadata?: Record<string, unknown>
  ): Promise<Observation> {
    await this.init();

    const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    const filename = `${key.replace(/[^a-zA-Z0-9-_]/g, '_')}-${contentHash}.txt`;
    const filepath = join(this.storeDir, filename);

    // Write content to file
    await writeFile(filepath, content, 'utf-8');

    // Create observation record
    const observation: Observation = {
      key,
      summary: this.createSummary(content),
      filepath,
      contentHash,
      size: content.length,
      timestamp: new Date().toISOString(),
      type,
      metadata,
    };

    // Update index
    if (this.index) {
      // Remove old observation with same key if exists
      const oldObs = this.index.observations[key];
      if (oldObs) {
        this.index.totalSize -= oldObs.size;
        try {
          await unlink(oldObs.filepath);
        } catch {
          // File already deleted
        }
      }

      this.index.observations[key] = observation;
      this.index.totalSize += content.length;
      await this.saveIndex();

      // Cleanup if needed
      await this.cleanup();
    }

    return observation;
  }

  /**
   * Create a summary of the content
   */
  private createSummary(content: string): string {
    // Take first N chars, but try to break at word boundary
    let summary = content.slice(0, SUMMARY_MAX_CHARS);

    if (content.length > SUMMARY_MAX_CHARS) {
      const lastSpace = summary.lastIndexOf(' ');
      if (lastSpace > SUMMARY_MAX_CHARS / 2) {
        summary = summary.slice(0, lastSpace);
      }
      summary += '...';
    }

    // Clean up newlines
    summary = summary.replace(/\n+/g, ' ').trim();

    return summary;
  }

  /**
   * Retrieve full content for an observation
   */
  async retrieve(key: string): Promise<string | null> {
    await this.init();

    const observation = this.index?.observations[key];
    if (!observation) return null;

    try {
      return await readFile(observation.filepath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Get observation metadata (summary + path, no content)
   */
  getObservation(key: string): Observation | null {
    return this.index?.observations[key] ?? null;
  }

  /**
   * Get summary reference for injection into prompts
   */
  getSummaryReference(key: string): string {
    const obs = this.getObservation(key);
    if (!obs) return '';

    return `<observation key="${key}" size="${obs.size}" type="${obs.type}">
<summary>${obs.summary}</summary>
<file>${obs.filepath}</file>
<note>Full content saved to file. Read if needed.</note>
</observation>`;
  }

  /**
   * List all observations
   */
  listAll(): Observation[] {
    if (!this.index) return [];
    return Object.values(this.index.observations);
  }

  /**
   * Delete an observation
   */
  async delete(key: string): Promise<boolean> {
    await this.init();

    const observation = this.index?.observations[key];
    if (!observation) return false;

    try {
      await unlink(observation.filepath);
    } catch {
      // File already deleted
    }

    if (this.index) {
      this.index.totalSize -= observation.size;
      delete this.index.observations[key];
      await this.saveIndex();
    }

    return true;
  }

  /**
   * Cleanup old observations to stay within limits
   */
  private async cleanup(): Promise<void> {
    if (!this.index) return;

    const observations = Object.values(this.index.observations);
    const maxSize = MAX_TOTAL_SIZE_MB * 1024 * 1024;

    // Check if we need to cleanup
    if (observations.length <= MAX_OBSERVATIONS && this.index.totalSize <= maxSize) {
      return;
    }

    // Sort by timestamp (oldest first)
    observations.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Remove oldest until within limits
    while (
      (observations.length > MAX_OBSERVATIONS || this.index.totalSize > maxSize) &&
      observations.length > 0
    ) {
      const oldest = observations.shift();
      if (oldest) {
        await this.delete(oldest.key);
      }
    }
  }

  /**
   * Get total store size
   */
  getTotalSize(): number {
    return this.index?.totalSize ?? 0;
  }

  /**
   * Get observation count
   */
  getCount(): number {
    return Object.keys(this.index?.observations ?? {}).length;
  }

  /**
   * Clear all observations
   */
  async clear(): Promise<void> {
    await this.init();

    if (this.index) {
      for (const key of Object.keys(this.index.observations)) {
        await this.delete(key);
      }
    }
  }
}

/**
 * Singleton store factory
 */
const stores = new Map<string, ObservationStore>();

export function getObservationStore(workingDir: string): ObservationStore {
  if (!stores.has(workingDir)) {
    stores.set(workingDir, new ObservationStore(workingDir));
  }
  return stores.get(workingDir)!;
}
