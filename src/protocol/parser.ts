/**
 * Protocol Parser
 *
 * Parses structured daemon protocol messages from agent output.
 * Adapted from Memorai's supervisor output parsing patterns.
 */

import type {
  DaemonMessage,
  DaemonHeartbeat,
  DaemonStatus,
  DaemonCheckpoint,
  DaemonComplete,
  DaemonBlocked,
  DaemonError,
  WorkerResult,
  FileModification,
} from '../types/protocol.ts';

/** Parse daemon protocol messages from agent output */
export class ProtocolParser {
  /**
   * Parse a single line for protocol messages
   * Returns null if line doesn't contain a protocol message
   */
  parseLine(line: string, agentId: string = ''): DaemonMessage | null {
    const timestamp = new Date().toISOString();

    // [HEARTBEAT] context=X% task=Y queue=Z blockers=N
    const heartbeatMatch = line.match(
      /\[HEARTBEAT\]\s+context=(\d+)%\s+task=(\S+)\s+queue=(\d+)\s+blockers=(\d+)/
    );
    if (heartbeatMatch) {
      const [, contextPct, taskId, queuePending, blockerCount] = heartbeatMatch;
      return {
        type: 'HEARTBEAT',
        agentId,
        timestamp,
        context: {
          percentUsed: parseInt(contextPct!, 10),
          tokensUsed: 0,
          contextLimit: 200000,
        },
        task: {
          id: taskId === 'none' ? null : parseInt(taskId!, 10),
          title: '',
          progress: 'implementing',
        },
        queue: {
          pending: parseInt(queuePending!, 10),
          active: 1,
          completed: 0,
        },
        blockers: parseInt(blockerCount!, 10),
      } satisfies DaemonHeartbeat;
    }

    // [STATUS] Description here
    const statusMatch = line.match(/\[STATUS\]\s+(.+)/);
    if (statusMatch?.[1]) {
      return {
        type: 'STATUS',
        agentId,
        timestamp,
        description: statusMatch[1],
        phase: 'implementation',
        confidence: 'medium',
      } satisfies DaemonStatus;
    }

    // [CHECKPOINT] State saved...
    const checkpointMatch = line.match(/\[CHECKPOINT\]\s+(.+)/);
    if (checkpointMatch?.[1]) {
      return {
        type: 'CHECKPOINT',
        agentId,
        timestamp,
        taskId: null,
        filesModified: [],
        uncommittedChanges: [],
        stateSnapshot: checkpointMatch[1],
        canReplace: true,
      } satisfies DaemonCheckpoint;
    }

    // [COMPLETE] Task X done / description
    const completeMatch = line.match(/\[COMPLETE\]\s+(?:Task\s+(\d+)\s+)?(.+)/);
    if (completeMatch?.[2]) {
      return {
        type: 'COMPLETE',
        agentId,
        timestamp,
        taskId: completeMatch[1] ? parseInt(completeMatch[1], 10) : 0,
        result: 'success',
        summary: completeMatch[2],
        filesModified: [],
        learnings: [],
      } satisfies DaemonComplete;
    }

    // [BLOCKED] Reason
    const blockedMatch = line.match(/\[BLOCKED\]\s+(.+)/);
    if (blockedMatch?.[1]) {
      return {
        type: 'BLOCKED',
        agentId,
        timestamp,
        taskId: null,
        reason: blockedMatch[1],
        blockerType: 'technical',
        suggestedAction: '',
      } satisfies DaemonBlocked;
    }

    // [ERROR] Details
    const errorMatch = line.match(/\[ERROR\]\s+(.+)/);
    if (errorMatch?.[1]) {
      return {
        type: 'ERROR',
        agentId,
        timestamp,
        taskId: null,
        error: errorMatch[1],
        severity: 'error',
        recoverable: true,
        context: '',
      } satisfies DaemonError;
    }

    return null;
  }

  /**
   * Parse worker result JSON from output lines
   */
  parseWorkerResult(output: string[]): WorkerResult | null {
    const fullOutput = output.join('\n');

    // Try JSON in code block first
    const jsonBlockMatch = fullOutput.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch?.[1]) {
      try {
        return this.validateWorkerResult(JSON.parse(jsonBlockMatch[1]));
      } catch {
        // Fall through to next attempt
      }
    }

    // Try raw JSON object with taskId
    const rawJsonMatch = fullOutput.match(/\{[\s\S]*"taskId"[\s\S]*\}/);
    if (rawJsonMatch) {
      try {
        return this.validateWorkerResult(JSON.parse(rawJsonMatch[0]));
      } catch {
        // Fall through
      }
    }

    // Try brace matching for nested JSON
    const braceMatch = this.extractJsonByBraceMatching(fullOutput);
    if (braceMatch) {
      try {
        return this.validateWorkerResult(JSON.parse(braceMatch));
      } catch {
        // Fall through
      }
    }

    return null;
  }

  /**
   * Validate and normalize a parsed worker result
   */
  private validateWorkerResult(parsed: unknown): WorkerResult | null {
    if (!parsed || typeof parsed !== 'object') return null;

    const obj = parsed as Record<string, unknown>;

    if (typeof obj.taskId !== 'number') return null;
    if (!obj.status || !['success', 'partial', 'failed', 'blocked'].includes(obj.status as string)) {
      return null;
    }

    return {
      taskId: obj.taskId as number,
      status: obj.status as WorkerResult['status'],
      filesModified: this.normalizeFileModifications(obj.filesModified),
      testsRun: Boolean(obj.testsRun),
      testsPassed: Boolean(obj.testsPassed),
      learnings: Array.isArray(obj.learnings) ? obj.learnings : [],
      blockers: Array.isArray(obj.blockers) ? obj.blockers : undefined,
      uncommittedWork: typeof obj.uncommittedWork === 'string' ? obj.uncommittedWork : undefined,
      nextSteps: Array.isArray(obj.nextSteps) ? obj.nextSteps : undefined,
      summary: typeof obj.summary === 'string' ? obj.summary : '',
    };
  }

  /**
   * Normalize file modifications array
   */
  private normalizeFileModifications(files: unknown): FileModification[] {
    if (!Array.isArray(files)) return [];

    return files
      .filter((f): f is Record<string, unknown> => f && typeof f === 'object')
      .map((f) => ({
        path: String(f.path || ''),
        action: (['created', 'modified', 'deleted'].includes(f.action as string)
          ? f.action
          : 'modified') as FileModification['action'],
        linesChanged: typeof f.linesChanged === 'string' ? f.linesChanged : undefined,
        functions: Array.isArray(f.functions) ? f.functions : undefined,
        summary: String(f.summary || ''),
      }));
  }

  /**
   * Extract JSON by matching braces (handles nested objects)
   */
  private extractJsonByBraceMatching(text: string): string | null {
    const start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') depth++;
        if (char === '}') {
          depth--;
          if (depth === 0) {
            return text.slice(start, i + 1);
          }
        }
      }
    }

    return null;
  }

  /**
   * Check if output contains a completion signal
   */
  hasCompletionSignal(output: string[], signal: string): boolean {
    return output.some((line) => line.includes(signal));
  }

  /**
   * Extract all protocol messages from output
   */
  parseAllMessages(output: string[], agentId: string = ''): DaemonMessage[] {
    const messages: DaemonMessage[] = [];
    for (const line of output) {
      const msg = this.parseLine(line, agentId);
      if (msg) messages.push(msg);
    }
    return messages;
  }
}

/** Singleton parser instance */
export const protocolParser = new ProtocolParser();
