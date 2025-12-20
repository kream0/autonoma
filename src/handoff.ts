/**
 * Handoff Management
 *
 * Handles parsing of handoff blocks from agent output,
 * storage of handoff state, and injection into replacement agents.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AgentHandoff,
  AgentRole,
  ParsedHandoff,
  TokenUsage,
} from './types.ts';

/**
 * Parse a handoff block from agent output
 */
export function parseHandoffBlock(output: string[]): ParsedHandoff | null {
  const fullOutput = output.join('\n');

  // Find the handoff block
  const handoffMatch = fullOutput.match(/<handoff[^>]*>([\s\S]*?)<\/handoff>/);
  if (!handoffMatch) {
    return null;
  }

  const handoffContent = handoffMatch[0];

  try {
    // Extract task_id from attributes
    const taskIdMatch = handoffContent.match(/task_id="(\d+)"/);
    const taskId = taskIdMatch?.[1] ? parseInt(taskIdMatch[1], 10) : 0;

    // Extract status
    const statusMatch = handoffContent.match(/<status>([\s\S]*?)<\/status>/);
    const statusRaw = statusMatch?.[1]?.trim() || 'in_progress';
    const status = validateStatus(statusRaw);

    // Extract files_modified
    const filesModified = parseFilesModified(handoffContent);

    // Extract files_to_touch
    const filesToTouch = parseFilesToTouch(handoffContent);

    // Extract current_state
    const currentStateMatch = handoffContent.match(/<current_state>([\s\S]*?)<\/current_state>/);
    const currentState = currentStateMatch?.[1]?.trim() || '';

    // Extract blockers
    const blockersMatch = handoffContent.match(/<blockers>([\s\S]*?)<\/blockers>/);
    const blockers = blockersMatch?.[1]?.trim();

    // Extract next_steps
    const nextStepsMatch = handoffContent.match(/<next_steps>([\s\S]*?)<\/next_steps>/);
    const nextSteps = nextStepsMatch?.[1]?.trim() || '';

    // Extract context
    const contextMatch = handoffContent.match(/<context>([\s\S]*?)<\/context>/);
    const context = contextMatch?.[1]?.trim();

    return {
      taskId,
      status,
      filesModified,
      filesToTouch,
      currentState,
      blockers,
      nextSteps,
      context,
    };
  } catch {
    return null;
  }
}

function validateStatus(status: string): ParsedHandoff['status'] {
  const validStatuses: ParsedHandoff['status'][] = ['pending', 'in_progress', 'blocked', 'nearly_complete'];
  return validStatuses.includes(status as ParsedHandoff['status'])
    ? (status as ParsedHandoff['status'])
    : 'in_progress';
}

function parseFilesModified(content: string): ParsedHandoff['filesModified'] {
  const files: ParsedHandoff['filesModified'] = [];

  // Match the files_modified section
  const sectionMatch = content.match(/<files_modified>([\s\S]*?)<\/files_modified>/);
  if (!sectionMatch?.[1]) return files;

  // Match individual file entries
  const fileMatches = sectionMatch[1].matchAll(/<file\s+([^>]*)\/?>(?:<\/file>)?/g);
  for (const match of fileMatches) {
    const attrs = match[1] ?? '';

    const pathMatch = attrs.match(/path="([^"]*)"/);
    const linesMatch = attrs.match(/lines="([^"]*)"/);
    const functionsMatch = attrs.match(/functions="([^"]*)"/);

    if (pathMatch?.[1]) {
      files.push({
        path: pathMatch[1],
        lines: linesMatch?.[1],
        functions: functionsMatch?.[1],
      });
    }
  }

  return files;
}

function parseFilesToTouch(content: string): ParsedHandoff['filesToTouch'] {
  const files: ParsedHandoff['filesToTouch'] = [];

  // Match the files_to_touch section
  const sectionMatch = content.match(/<files_to_touch>([\s\S]*?)<\/files_to_touch>/);
  if (!sectionMatch?.[1]) return files;

  // Match individual file entries
  const fileMatches = sectionMatch[1].matchAll(/<file\s+([^>]*)\/?>(?:<\/file>)?/g);
  for (const match of fileMatches) {
    const attrs = match[1] ?? '';

    const pathMatch = attrs.match(/path="([^"]*)"/);
    const reasonMatch = attrs.match(/reason="([^"]*)"/);

    if (pathMatch?.[1]) {
      files.push({
        path: pathMatch[1],
        reason: reasonMatch?.[1] || '',
      });
    }
  }

  return files;
}

/**
 * Create a handoff record
 */
export function createHandoffRecord(
  agentId: string,
  role: AgentRole,
  taskId: number | undefined,
  tokenUsage: TokenUsage,
  handoffBlock: ParsedHandoff | null
): AgentHandoff {
  return {
    agentId,
    role,
    taskId,
    timestamp: new Date().toISOString(),
    tokenUsage,
    handoffBlock,
  };
}

/**
 * Format handoff for injection into replacement agent prompt
 */
export function formatHandoffForInjection(handoff: AgentHandoff): string {
  if (!handoff.handoffBlock) {
    return `<previous_agent_handoff>
<agent_id>${handoff.agentId}</agent_id>
<role>${handoff.role}</role>
<note>Previous agent did not provide structured handoff. Check recent file changes.</note>
</previous_agent_handoff>`;
  }

  const h = handoff.handoffBlock;

  const filesModifiedXml = h.filesModified.length > 0
    ? h.filesModified.map(f =>
      `    <file path="${f.path}"${f.lines ? ` lines="${f.lines}"` : ''}${f.functions ? ` functions="${f.functions}"` : ''}/>`
    ).join('\n')
    : '    <none/>';

  const filesToTouchXml = h.filesToTouch.length > 0
    ? h.filesToTouch.map(f =>
      `    <file path="${f.path}" reason="${f.reason}"/>`
    ).join('\n')
    : '    <none/>';

  return `<previous_agent_handoff>
<agent_id>${handoff.agentId}</agent_id>
<role>${handoff.role}</role>
<task_id>${h.taskId}</task_id>
<status>${h.status}</status>

<files_modified>
${filesModifiedXml}
</files_modified>

<files_to_touch>
${filesToTouchXml}
</files_to_touch>

<current_state>${h.currentState}</current_state>
${h.blockers ? `<blockers>${h.blockers}</blockers>` : ''}
<next_steps>${h.nextSteps}</next_steps>
${h.context ? `<context>${h.context}</context>` : ''}

<instruction>Continue from where the previous agent left off. Review the files_modified to understand current state, then proceed with next_steps.</instruction>
</previous_agent_handoff>`;
}

/**
 * Handoff storage manager
 */
export class HandoffStorage {
  private stateDir: string;
  private handoffsDir: string;

  constructor(workingDir: string) {
    this.stateDir = join(workingDir, '.autonoma');
    this.handoffsDir = join(this.stateDir, 'handoffs');
  }

  /**
   * Initialize storage directories
   */
  async init(): Promise<void> {
    await mkdir(this.handoffsDir, { recursive: true });
  }

  /**
   * Save a handoff record to disk
   */
  async saveHandoff(handoff: AgentHandoff): Promise<void> {
    await this.init();
    const filename = `${handoff.agentId}-${Date.now()}.json`;
    const filepath = join(this.handoffsDir, filename);
    await writeFile(filepath, JSON.stringify(handoff, null, 2), 'utf-8');
  }

  /**
   * Load all handoffs for a specific role
   */
  async loadHandoffsForRole(role: AgentRole): Promise<AgentHandoff[]> {
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(this.handoffsDir);
      const handoffs: AgentHandoff[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await readFile(join(this.handoffsDir, file), 'utf-8');
            const handoff = JSON.parse(content) as AgentHandoff;
            if (handoff.role === role) {
              handoffs.push(handoff);
            }
          } catch {
            // Skip invalid files
          }
        }
      }

      // Sort by timestamp, newest first
      return handoffs.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * Get the most recent handoff for a role
   */
  async getLatestHandoff(role: AgentRole): Promise<AgentHandoff | null> {
    const handoffs = await this.loadHandoffsForRole(role);
    return handoffs[0] || null;
  }

  /**
   * Get handoff count for statistics
   */
  async getHandoffCount(): Promise<number> {
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(this.handoffsDir);
      return files.filter(f => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }
}
