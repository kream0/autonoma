/**
 * SQLite Database Schema with FTS5
 *
 * Adapted from Memorai's database patterns for persistent state
 * and searchable memory storage.
 */

import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

/** Current schema version */
const SCHEMA_VERSION = 1;

/** Full schema SQL with FTS5 */
const SCHEMA_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- =====================================================
-- SESSIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  requirements_path TEXT NOT NULL,
  has_project_context INTEGER DEFAULT 0,
  phase TEXT NOT NULL DEFAULT 'idle',
  max_developers INTEGER DEFAULT 6,
  indefinite_mode INTEGER DEFAULT 0,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);

-- Completed phases per session
CREATE TABLE IF NOT EXISTS phases (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  UNIQUE(session_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_phases_session ON phases(session_id);

-- =====================================================
-- MILESTONES (from CEO planning)
-- =====================================================

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  milestone_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_milestones_session ON milestones(session_id, milestone_number);

-- =====================================================
-- BATCHES & TASKS
-- =====================================================

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  batch_number INTEGER NOT NULL,
  parallel INTEGER DEFAULT 0,
  max_parallel_tasks INTEGER,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'complete', 'failed')),
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_batches_session ON batches(session_id, batch_number);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  task_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  files TEXT,
  complexity TEXT CHECK(complexity IN ('simple', 'moderate', 'complex', 'very_complex')),
  context TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'complete', 'failed')),
  assigned_to TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  last_failure_reason TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_batch ON tasks(batch_id, task_number);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);

-- FTS5 for task search
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  title,
  description,
  context,
  content='tasks',
  content_rowid='rowid'
);

-- Triggers to sync FTS
CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, description, context)
  VALUES (NEW.rowid, NEW.title, NEW.description, NEW.context);
END;

CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description, context)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.description, OLD.context);
END;

CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description, context)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.description, OLD.context);
  INSERT INTO tasks_fts(rowid, title, description, context)
  VALUES (NEW.rowid, NEW.title, NEW.description, NEW.context);
END;

-- =====================================================
-- AGENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ceo', 'staff', 'developer', 'qa', 'e2e')),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'idle' CHECK(status IN ('idle', 'running', 'complete', 'error')),
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  created_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  error_message TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_id);
CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role);

-- =====================================================
-- CHECKPOINTS / HANDOFFS
-- =====================================================

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  timestamp TEXT NOT NULL,
  current_batch_index INTEGER,
  tasks_in_progress TEXT,
  ceo_feedback TEXT,
  ceo_approval_attempts INTEGER DEFAULT 0,
  context_estimate INTEGER,
  handoff_data TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_timestamp ON checkpoints(timestamp DESC);

-- =====================================================
-- EVENTS (audit log)
-- =====================================================

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  agent_id TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

-- =====================================================
-- MEMORIES (persistent learning)
-- =====================================================

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  category TEXT NOT NULL CHECK(category IN ('architecture', 'decisions', 'reports', 'summaries', 'structure', 'notes')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  tags TEXT,
  importance INTEGER DEFAULT 5 CHECK(importance >= 1 AND importance <= 10),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  source_task TEXT,
  source_agent TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);

-- FTS5 for memory search with BM25 ranking
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  title,
  content,
  summary,
  tags,
  content='memories',
  content_rowid='rowid'
);

-- Sync triggers for memories FTS
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, title, content, summary, tags)
  VALUES (NEW.rowid, NEW.title, NEW.content, NEW.summary, NEW.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, content, summary, tags)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.content, OLD.summary, OLD.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, content, summary, tags)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.content, OLD.summary, OLD.tags);
  INSERT INTO memories_fts(rowid, title, content, summary, tags)
  VALUES (NEW.rowid, NEW.title, NEW.content, NEW.summary, NEW.tags);
END;
`;

/** Generate short UUID */
function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Database wrapper with schema management */
export class AutonomaDb {
  private db: Database;
  readonly dbPath: string;

  constructor(workingDir: string) {
    const stateDir = join(workingDir, '.autonoma');
    this.dbPath = join(stateDir, 'autonoma.db');
    this.db = new Database(this.dbPath, { create: true });

    // Enable WAL mode for better concurrency
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  /**
   * Initialize database schema with migrations
   */
  async init(): Promise<{ created: boolean; version: number }> {
    const version = this.getSchemaVersion();

    if (version === 0) {
      // Fresh install - create all tables
      this.db.exec(SCHEMA_SQL);
      this.setSchemaVersion(SCHEMA_VERSION);
      return { created: true, version: SCHEMA_VERSION };
    }

    // Apply migrations if needed
    if (version < SCHEMA_VERSION) {
      await this.migrate(version, SCHEMA_VERSION);
    }

    return { created: false, version: this.getSchemaVersion() };
  }

  /**
   * Get current schema version
   */
  getSchemaVersion(): number {
    try {
      const row = this.db
        .prepare("SELECT value FROM schema_meta WHERE key = 'version'")
        .get() as { value: string } | undefined;
      return row ? parseInt(row.value, 10) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Set schema version
   */
  private setSchemaVersion(version: number): void {
    this.db.run(`
      INSERT OR REPLACE INTO schema_meta (key, value, updated_at)
      VALUES ('version', ?, datetime('now'))
    `, [version.toString()]);
  }

  /**
   * Apply schema migrations
   */
  private async migrate(_from: number, to: number): Promise<void> {
    // Future migrations go here
    // if (_from < 2) { ... }
    this.setSchemaVersion(to);
  }

  /**
   * Get the raw database instance
   */
  get raw(): Database {
    return this.db;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  // =====================================================
  // MEMORY OPERATIONS
  // =====================================================

  /**
   * Store a memory
   */
  storeMemory(memory: {
    sessionId?: string;
    category: string;
    title: string;
    content: string;
    summary?: string;
    tags?: string[];
    importance?: number;
    expiresAt?: string;
    sourceTask?: string;
    sourceAgent?: string;
  }): string {
    const id = generateId();
    const now = new Date().toISOString();

    this.db.run(`
      INSERT INTO memories (
        id, session_id, category, title, content, summary, tags,
        importance, created_at, updated_at, expires_at, source_task, source_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      memory.sessionId ?? null,
      memory.category,
      memory.title,
      memory.content,
      memory.summary ?? this.generateSummary(memory.content),
      memory.tags ? JSON.stringify(memory.tags) : null,
      memory.importance ?? 5,
      now,
      now,
      memory.expiresAt ?? null,
      memory.sourceTask ?? null,
      memory.sourceAgent ?? null,
    ]);

    return id;
  }

  /**
   * Search memories using FTS5 with BM25 ranking
   */
  searchMemories(
    query: string,
    options: {
      categories?: string[];
      minImportance?: number;
      limit?: number;
    } = {}
  ): Array<{ id: string; category: string; title: string; content: string; summary: string; importance: number; relevance: number }> {
    const limit = options.limit ?? 10;
    const ftsQuery = query.replace(/"/g, '""');

    try {
      let sql = `
        SELECT m.id, m.category, m.title, m.content, m.summary, m.importance,
               bm25(memories_fts, 1.0, 0.5, 0.75, 0.25) as score
        FROM memories_fts f
        JOIN memories m ON m.rowid = f.rowid
        WHERE memories_fts MATCH ?
      `;

      const params: (string | number)[] = [ftsQuery];

      if (options.categories?.length) {
        sql += ` AND m.category IN (${options.categories.map(() => '?').join(',')})`;
        params.push(...options.categories);
      }

      if (options.minImportance !== undefined) {
        sql += ` AND m.importance >= ?`;
        params.push(options.minImportance);
      }

      sql += ` AND (m.expires_at IS NULL OR m.expires_at > datetime('now'))`;
      sql += ` ORDER BY score LIMIT ?`;
      params.push(limit);

      const rows = this.db.prepare(sql).all(...params) as Array<{
        id: string;
        category: string;
        title: string;
        content: string;
        summary: string;
        importance: number;
        score: number;
      }>;

      return rows.map((row) => ({
        ...row,
        relevance: Math.min(100, Math.abs(row.score) * 10),
      }));
    } catch {
      // Fallback to LIKE search
      return this.searchMemoriesLike(query, options);
    }
  }

  /**
   * Fallback LIKE-based search
   */
  private searchMemoriesLike(
    query: string,
    options: { categories?: string[]; minImportance?: number; limit?: number }
  ): Array<{ id: string; category: string; title: string; content: string; summary: string; importance: number; relevance: number }> {
    const limit = options.limit ?? 10;
    const pattern = `%${query}%`;

    let sql = `
      SELECT id, category, title, content, summary, importance
      FROM memories
      WHERE (title LIKE ? OR content LIKE ? OR summary LIKE ?)
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    `;

    const params: (string | number)[] = [pattern, pattern, pattern];

    if (options.categories?.length) {
      sql += ` AND category IN (${options.categories.map(() => '?').join(',')})`;
      params.push(...options.categories);
    }

    if (options.minImportance !== undefined) {
      sql += ` AND importance >= ?`;
      params.push(options.minImportance);
    }

    sql += ` ORDER BY importance DESC, created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string;
      category: string;
      title: string;
      content: string;
      summary: string;
      importance: number;
    }>;

    return rows.map((row) => ({ ...row, relevance: 50 }));
  }

  /**
   * Get memories by category
   */
  getMemoriesByCategory(
    category: string,
    limit: number = 10
  ): Array<{ id: string; title: string; content: string; summary: string; importance: number }> {
    const rows = this.db.prepare(`
      SELECT id, title, content, summary, importance
      FROM memories
      WHERE category = ?
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(category, limit) as Array<{
      id: string;
      title: string;
      content: string;
      summary: string;
      importance: number;
    }>;

    return rows;
  }

  /**
   * Generate a summary from content
   */
  private generateSummary(content: string, maxLength: number = 200): string {
    // Remove markdown headers
    let text = content.replace(/^#+\s+/gm, '');

    // Get first paragraph
    const paragraphs = text.split(/\n\n+/);
    text = paragraphs[0] || text;

    // Truncate at sentence boundary if possible
    if (text.length > maxLength) {
      const truncated = text.slice(0, maxLength);
      const lastPeriod = truncated.lastIndexOf('.');
      if (lastPeriod > maxLength / 2) {
        return truncated.slice(0, lastPeriod + 1);
      }
      return truncated + '...';
    }

    return text;
  }

  // =====================================================
  // EVENT LOGGING
  // =====================================================

  /**
   * Log an event
   */
  logEvent(
    sessionId: string,
    source: 'orchestrator' | 'agent' | 'user',
    type: string,
    agentId?: string,
    payload?: Record<string, unknown>
  ): void {
    const id = generateId();
    this.db.run(`
      INSERT INTO events (id, session_id, source, type, agent_id, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      id,
      sessionId,
      source,
      type,
      agentId ?? null,
      payload ? JSON.stringify(payload) : null,
    ]);
  }
}

/**
 * Ensure database directory exists and create database
 */
export async function createDatabase(workingDir: string): Promise<AutonomaDb> {
  const stateDir = join(workingDir, '.autonoma');
  await mkdir(stateDir, { recursive: true });

  const db = new AutonomaDb(workingDir);
  await db.init();
  return db;
}
