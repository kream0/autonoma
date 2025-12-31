/**
 * Prompt Builder for KV-Cache Optimization
 *
 * Structures prompts to maximize KV-cache efficiency:
 * 1. STATIC section - System prompt, guidelines (cached across agents)
 * 2. SEMI-STATIC section - Batch context, patterns (cached within batch)
 * 3. DYNAMIC section - Task-specific content
 * 4. RECITATION block - Objective summary at END (most attentive region)
 *
 * This ordering ensures stable prefixes that benefit from caching,
 * while placing task-critical reminders in the attention-optimal position.
 */

import type { DevTask } from '../types.ts';
import { createHash } from 'crypto';

// ============================================
// TYPES
// ============================================

export interface PromptSection {
  type: 'static' | 'semi-static' | 'dynamic' | 'recitation';
  content: string;
  tag?: string;
}

export interface PromptBuilderConfig {
  includeRecitation: boolean;
  maxIterations: number;
  currentIteration: number;
}

export interface ProgressInfo {
  filesCreated: string[];
  filesModified: string[];
  testsStatus: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  errorsEncountered: string[];
}

// ============================================
// PROMPT BUILDER CLASS
// ============================================

export class PromptBuilder {
  private sections: PromptSection[] = [];
  private staticHash: string | null = null;

  /**
   * Reset builder for new prompt
   */
  reset(): this {
    this.sections = [];
    this.staticHash = null;
    return this;
  }

  /**
   * Add static content (system prompt, guidelines)
   * This content is stable across all agents and benefits from caching.
   */
  addStatic(content: string, tag?: string): this {
    this.sections.push({
      type: 'static',
      content: content.trim(),
      tag,
    });
    return this;
  }

  /**
   * Add semi-static content (batch context, patterns)
   * This content is stable within a batch of tasks.
   */
  addSemiStatic(content: string, tag?: string): this {
    this.sections.push({
      type: 'semi-static',
      content: content.trim(),
      tag,
    });
    return this;
  }

  /**
   * Add dynamic content (task description, retry context)
   * This content changes per task.
   */
  addDynamic(content: string, tag?: string): this {
    this.sections.push({
      type: 'dynamic',
      content: content.trim(),
      tag,
    });
    return this;
  }

  /**
   * Add recitation block (objective reminder at END)
   * This is placed at the end for maximum attention.
   */
  addRecitation(content: string): this {
    this.sections.push({
      type: 'recitation',
      content: content.trim(),
    });
    return this;
  }

  /**
   * Build the final prompt string with proper ordering
   */
  build(): string {
    // Order: static -> semi-static -> dynamic -> recitation
    const ordered: string[] = [];

    // Static sections first
    const staticSections = this.sections.filter(s => s.type === 'static');
    for (const section of staticSections) {
      if (section.tag) {
        ordered.push(`<${section.tag}>\n${section.content}\n</${section.tag}>`);
      } else {
        ordered.push(section.content);
      }
    }

    // Semi-static sections
    const semiStaticSections = this.sections.filter(s => s.type === 'semi-static');
    for (const section of semiStaticSections) {
      if (section.tag) {
        ordered.push(`<${section.tag}>\n${section.content}\n</${section.tag}>`);
      } else {
        ordered.push(section.content);
      }
    }

    // Dynamic sections
    const dynamicSections = this.sections.filter(s => s.type === 'dynamic');
    for (const section of dynamicSections) {
      if (section.tag) {
        ordered.push(`<${section.tag}>\n${section.content}\n</${section.tag}>`);
      } else {
        ordered.push(section.content);
      }
    }

    // Recitation block at the END (most attentive region)
    const recitationSections = this.sections.filter(s => s.type === 'recitation');
    for (const section of recitationSections) {
      ordered.push(section.content);
    }

    return ordered.join('\n\n');
  }

  /**
   * Get hash of static content for cache tracking
   */
  getStaticHash(): string {
    if (this.staticHash) return this.staticHash;

    const staticContent = this.sections
      .filter(s => s.type === 'static')
      .map(s => s.content)
      .join('\n');

    this.staticHash = createHash('sha256')
      .update(staticContent)
      .digest('hex')
      .slice(0, 16);

    return this.staticHash;
  }

  /**
   * Get the static portion of the prompt (for analysis)
   */
  getStaticPortion(): string {
    return this.sections
      .filter(s => s.type === 'static')
      .map(s => s.content)
      .join('\n');
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(): number {
    const fullPrompt = this.build();
    // Rough estimate: ~4 characters per token
    return Math.ceil(fullPrompt.length / 4);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate recitation block for a task
 */
export function generateRecitationBlock(
  task: DevTask,
  iteration: number,
  maxIterations: number,
  progress: ProgressInfo
): string {
  const filesSection = task.files?.length
    ? `Files to modify: ${task.files.join(', ')}`
    : 'Files to modify: As needed';

  const progressSection = progress.filesCreated.length > 0 || progress.filesModified.length > 0
    ? `
<progress>
Files created: ${progress.filesCreated.join(', ') || 'None yet'}
Files modified: ${progress.filesModified.join(', ') || 'None yet'}
Tests: ${progress.testsStatus}
${progress.errorsEncountered.length > 0 ? `Errors: ${progress.errorsEncountered.slice(-3).join('; ')}` : ''}
</progress>`
    : '';

  const urgencyNote = iteration >= maxIterations - 3
    ? `<urgency>Iteration ${iteration}/${maxIterations} - Prioritize completion!</urgency>`
    : '';

  return `<recitation>
<current_objective>
Task: ${task.title}
Description: ${task.description}
${filesSection}
</current_objective>
${progressSection}
<iteration>${iteration}/${maxIterations}</iteration>
${urgencyNote}
<completion_action>
When complete, output exactly:
<promise task_id="${task.id}">TASK_COMPLETE</promise>
</completion_action>
</recitation>`;
}

/**
 * Create a prompt builder with common static content
 */
export function createPromptBuilder(
  systemPrompt: string,
  projectContext?: string
): PromptBuilder {
  const builder = new PromptBuilder();

  // Add system prompt as static
  builder.addStatic(systemPrompt, 'system_prompt');

  // Add project context as semi-static
  if (projectContext) {
    builder.addSemiStatic(projectContext, 'project_context');
  }

  return builder;
}

/**
 * Build a complete developer prompt with all sections
 */
export function buildDeveloperPrompt(
  systemPrompt: string,
  projectContext: string,
  batchContext: string,
  task: DevTask,
  retryContext: string | null,
  memoryContext: string | null,
  iteration: number,
  maxIterations: number,
  progress: ProgressInfo
): string {
  const builder = new PromptBuilder();

  // Static section (cached across agents)
  builder.addStatic(systemPrompt, 'system_prompt');
  builder.addStatic(projectContext, 'project_context');

  // Semi-static section (cached within batch)
  builder.addSemiStatic(batchContext, 'batch_context');

  if (memoryContext) {
    builder.addSemiStatic(memoryContext, 'relevant_memories');
  }

  // Dynamic section (changes per task)
  const taskXml = `<task>
<id>${task.id}</id>
<title>${task.title}</title>
<description>${task.description}</description>
${task.files ? `<files>${task.files.join(', ')}</files>` : ''}
${task.complexity ? `<complexity>${task.complexity}</complexity>` : ''}
${task.context ? `<task_context>${task.context}</task_context>` : ''}
</task>`;

  builder.addDynamic(taskXml);

  if (retryContext) {
    builder.addDynamic(retryContext, 'retry_context');
  }

  // Add execution mode
  builder.addDynamic(`<execution_context>
<mode>PARALLEL</mode>
<constraint>Focus ONLY on the files listed above. Other developers are working on other files.</constraint>
</execution_context>`);

  // Recitation at the END (most attentive region)
  const recitation = generateRecitationBlock(task, iteration, maxIterations, progress);
  builder.addRecitation(recitation);

  return builder.build();
}

// Singleton builder for convenience
export const promptBuilder = new PromptBuilder();
