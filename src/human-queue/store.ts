/**
 * Human Queue SQLite Storage
 *
 * Persistent storage for human queue messages.
 */

import { Database } from 'bun:sqlite';
import type { HumanQueueMessage, HumanQueueFilter } from './types.ts';

interface DbRow {
  id: string;
  type: string;
  task_id: string | null;
  agent_id: string;
  content: string;
  priority: string;
  blocking: number;
  response: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
}

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export class HumanQueueStore {
  constructor(private db: Database) {
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS human_queue (
        id TEXT PRIMARY KEY,
        type TEXT CHECK(type IN ('question','approval','blocker')),
        task_id TEXT,
        agent_id TEXT NOT NULL,
        content TEXT NOT NULL,
        priority TEXT CHECK(priority IN ('low','medium','high','critical')),
        blocking INTEGER DEFAULT 0,
        response TEXT,
        status TEXT CHECK(status IN ('pending','responded','expired')) DEFAULT 'pending',
        created_at TEXT NOT NULL,
        responded_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_hq_status ON human_queue(status);
      CREATE INDEX IF NOT EXISTS idx_hq_task ON human_queue(task_id);
      CREATE INDEX IF NOT EXISTS idx_hq_blocking ON human_queue(blocking, status);
    `);
  }

  insert(
    message: Omit<HumanQueueMessage, 'id' | 'createdAt' | 'status'>
  ): string {
    const id = generateId();
    const now = new Date().toISOString();

    this.db.run(
      `
      INSERT INTO human_queue (id, type, task_id, agent_id, content, priority, blocking, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        id,
        message.type,
        message.taskId ?? null,
        message.agentId,
        message.content,
        message.priority,
        message.blocking ? 1 : 0,
        now,
      ]
    );

    return id;
  }

  getById(id: string): HumanQueueMessage | null {
    const row = this.db
      .prepare(`SELECT * FROM human_queue WHERE id = ?`)
      .get(id) as DbRow | undefined;

    return row ? this.toMessage(row) : null;
  }

  getPending(filter?: HumanQueueFilter): HumanQueueMessage[] {
    let sql = `SELECT * FROM human_queue WHERE status = 'pending'`;
    const params: (string | number)[] = [];

    if (filter?.type) {
      sql += ` AND type = ?`;
      params.push(filter.type);
    }
    if (filter?.taskId) {
      sql += ` AND task_id = ?`;
      params.push(filter.taskId);
    }
    if (filter?.blocking !== undefined) {
      sql += ` AND blocking = ?`;
      params.push(filter.blocking ? 1 : 0);
    }

    sql += ` ORDER BY CASE priority
      WHEN 'critical' THEN 0
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      ELSE 3 END, created_at ASC`;

    const rows = this.db.prepare(sql).all(...params) as DbRow[];
    return rows.map((r) => this.toMessage(r));
  }

  respond(id: string, response: string): boolean {
    const result = this.db.run(
      `
      UPDATE human_queue
      SET response = ?, status = 'responded', responded_at = ?
      WHERE id = ? AND status = 'pending'
    `,
      [response, new Date().toISOString(), id]
    );

    return result.changes > 0;
  }

  getResolutionForTask(taskId: string): string | null {
    const row = this.db
      .prepare(
        `
      SELECT response FROM human_queue
      WHERE task_id = ? AND status = 'responded'
      ORDER BY responded_at DESC LIMIT 1
    `
      )
      .get(taskId) as { response: string } | undefined;

    return row?.response ?? null;
  }

  expireOld(maxAgeHours: number = 24): number {
    const cutoff = new Date(
      Date.now() - maxAgeHours * 3600000
    ).toISOString();
    const result = this.db.run(
      `
      UPDATE human_queue SET status = 'expired'
      WHERE status = 'pending' AND created_at < ?
    `,
      [cutoff]
    );

    return result.changes;
  }

  /**
   * Get all messages (regardless of status)
   */
  getAll(): HumanQueueMessage[] {
    const rows = this.db.prepare(
      `SELECT * FROM human_queue ORDER BY created_at DESC`
    ).all() as DbRow[];
    return rows.map((r) => this.toMessage(r));
  }

  private toMessage(row: DbRow): HumanQueueMessage {
    return {
      id: row.id,
      type: row.type as HumanQueueMessage['type'],
      taskId: row.task_id ?? undefined,
      agentId: row.agent_id,
      content: row.content,
      priority: row.priority as HumanQueueMessage['priority'],
      blocking: Boolean(row.blocking),
      response: row.response ?? undefined,
      status: row.status as HumanQueueMessage['status'],
      createdAt: row.created_at,
      respondedAt: row.responded_at ?? undefined,
    };
  }
}
