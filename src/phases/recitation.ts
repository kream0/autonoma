/**
 * Recitation Block Generator
 *
 * Generates objective recitation blocks to be placed at the END of prompts.
 * This leverages the attention pattern where the end of context receives
 * high attention, reinforcing task objectives before agent response.
 *
 * Based on Ralph-Wiggum and Claude Code best practices:
 * - "Todo list works well as a way to 'recite' main objectives"
 * - "Placing info at the end helps keep it in focus"
 */

import type { DevTask } from '../types.ts';
import type { CompletionPromise } from '../types/protocol.ts';

// ============================================
// TYPES
// ============================================

export interface RecitationConfig {
  includeProgress: boolean;
  includeUrgency: boolean;
  includeCompletionCriteria: boolean;
  expectedPromise: CompletionPromise;
}

export interface TaskProgress {
  filesCreated: string[];
  filesModified: string[];
  testsStatus: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  verificationStatus?: 'pending' | 'passed' | 'failed';
  errorsEncountered: string[];
  blockers: string[];
}

const DEFAULT_CONFIG: RecitationConfig = {
  includeProgress: true,
  includeUrgency: true,
  includeCompletionCriteria: true,
  expectedPromise: 'TASK_COMPLETE',
};

// ============================================
// RECITATION GENERATORS
// ============================================

/**
 * Generate a recitation block for developer tasks
 */
export function generateDeveloperRecitation(
  task: DevTask,
  iteration: number,
  maxIterations: number,
  progress: TaskProgress,
  config: Partial<RecitationConfig> = {}
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const sections: string[] = [];

  // Objective section
  sections.push(`<current_objective>
Task ID: ${task.id}
Title: ${task.title}
Description: ${task.description}
${task.files?.length ? `Target files: ${task.files.join(', ')}` : 'Target files: As needed'}
${task.complexity ? `Complexity: ${task.complexity}` : ''}
</current_objective>`);

  // Progress section
  if (cfg.includeProgress && hasProgress(progress)) {
    sections.push(`<progress>
Iteration: ${iteration}/${maxIterations}
Files created: ${progress.filesCreated.join(', ') || 'None'}
Files modified: ${progress.filesModified.join(', ') || 'None'}
Tests: ${progress.testsStatus}
${progress.verificationStatus ? `Verification: ${progress.verificationStatus}` : ''}
${progress.errorsEncountered.length > 0 ? `Recent errors: ${progress.errorsEncountered.slice(-2).join('; ')}` : ''}
${progress.blockers.length > 0 ? `Blockers: ${progress.blockers.join('; ')}` : ''}
</progress>`);
  }

  // Urgency section
  if (cfg.includeUrgency) {
    const urgency = getUrgencyLevel(iteration, maxIterations);
    if (urgency !== 'normal') {
      sections.push(getUrgencyMessage(urgency, iteration, maxIterations));
    }
  }

  // Completion criteria
  if (cfg.includeCompletionCriteria) {
    sections.push(`<completion_criteria>
When ALL of these are true:
- Implementation matches the task description
- Code compiles without errors
- No obvious bugs remain
${task.files?.length ? `- Files created/modified: ${task.files.join(', ')}` : ''}

Output exactly:
<promise task_id="${task.id}">${cfg.expectedPromise}</promise>
</completion_criteria>`);
  }

  return `<recitation>\n${sections.join('\n\n')}\n</recitation>`;
}

/**
 * Generate recitation for CEO planning
 */
export function generateCeoRecitation(
  requirementsSummary: string,
  iteration: number,
  maxIterations: number
): string {
  const sections: string[] = [];

  sections.push(`<current_objective>
Create a high-level project plan with clear milestones.
Requirements summary: ${requirementsSummary.slice(0, 500)}${requirementsSummary.length > 500 ? '...' : ''}
</current_objective>`);

  sections.push(`<iteration>${iteration}/${maxIterations}</iteration>`);

  sections.push(`<completion_criteria>
Output a JSON block with milestones, then:
<promise>PLAN_COMPLETE</promise>
</completion_criteria>`);

  return `<recitation>\n${sections.join('\n\n')}\n</recitation>`;
}

/**
 * Generate recitation for Staff Engineer task breakdown
 */
export function generateStaffRecitation(
  milestonesCount: number,
  iteration: number,
  maxIterations: number
): string {
  const sections: string[] = [];

  sections.push(`<current_objective>
Break down ${milestonesCount} milestones into specific, actionable coding tasks.
Analyze complexity and recommend developer allocation.
Group tasks into batches based on dependencies.
</current_objective>`);

  sections.push(`<iteration>${iteration}/${maxIterations}</iteration>`);

  sections.push(`<completion_criteria>
Output a JSON block with batches and tasks, then:
<promise>TASKS_READY</promise>
</completion_criteria>`);

  return `<recitation>\n${sections.join('\n\n')}\n</recitation>`;
}

/**
 * Generate recitation for QA review
 */
export function generateQaRecitation(
  tasksToReview: number,
  iteration: number,
  maxIterations: number
): string {
  const sections: string[] = [];

  sections.push(`<current_objective>
Review ${tasksToReview} completed tasks.
Run tests and verify code quality.
Report any issues with specific task IDs.
</current_objective>`);

  sections.push(`<iteration>${iteration}/${maxIterations}</iteration>`);

  sections.push(`<completion_criteria>
Output a JSON review result, then:
<promise>REVIEW_COMPLETE</promise>
</completion_criteria>`);

  return `<recitation>\n${sections.join('\n\n')}\n</recitation>`;
}

/**
 * Generate recitation for CEO approval
 */
export function generateApprovalRecitation(
  testResults: { passed: number; failed: number },
  qaStatus: 'PASS' | 'FAIL',
  iteration: number,
  maxIterations: number
): string {
  const sections: string[] = [];

  sections.push(`<current_objective>
Review project completion status.
Tests: ${testResults.passed} passed, ${testResults.failed} failed
QA Status: ${qaStatus}
Decide: Approve project or request fixes.
</current_objective>`);

  sections.push(`<iteration>${iteration}/${maxIterations}</iteration>`);

  sections.push(`<completion_criteria>
If approving: <promise>APPROVED</promise>
If rejecting: <promise>REJECTED</promise>
Include feedback in your response.
</completion_criteria>`);

  return `<recitation>\n${sections.join('\n\n')}\n</recitation>`;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

type UrgencyLevel = 'normal' | 'warning' | 'critical' | 'final';

function getUrgencyLevel(iteration: number, maxIterations: number): UrgencyLevel {
  const remaining = maxIterations - iteration;

  if (remaining <= 1) return 'final';
  if (remaining <= 2) return 'critical';
  if (remaining <= 3) return 'warning';
  return 'normal';
}

function getUrgencyMessage(
  level: UrgencyLevel,
  iteration: number,
  maxIterations: number
): string {
  const remaining = maxIterations - iteration;

  switch (level) {
    case 'final':
      return `<urgency level="FINAL">
FINAL ITERATION! You MUST complete the task now.
Output <promise>TASK_COMPLETE</promise> with whatever progress you have made.
</urgency>`;

    case 'critical':
      return `<urgency level="CRITICAL">
${remaining} iterations remaining. Prioritize completion over perfection.
Focus on making the code work, not perfect.
</urgency>`;

    case 'warning':
      return `<urgency level="WARNING">
${remaining} iterations remaining. Begin wrapping up.
Avoid starting new exploration. Complete what you have.
</urgency>`;

    default:
      return '';
  }
}

function hasProgress(progress: TaskProgress): boolean {
  return (
    progress.filesCreated.length > 0 ||
    progress.filesModified.length > 0 ||
    progress.testsStatus !== 'pending' ||
    progress.errorsEncountered.length > 0 ||
    progress.blockers.length > 0
  );
}

/**
 * Create empty progress object
 */
export function createEmptyProgress(): TaskProgress {
  return {
    filesCreated: [],
    filesModified: [],
    testsStatus: 'pending',
    errorsEncountered: [],
    blockers: [],
  };
}

/**
 * Merge progress from multiple sources
 */
export function mergeProgress(base: TaskProgress, update: Partial<TaskProgress>): TaskProgress {
  return {
    filesCreated: [...base.filesCreated, ...(update.filesCreated || [])],
    filesModified: [...base.filesModified, ...(update.filesModified || [])],
    testsStatus: update.testsStatus || base.testsStatus,
    verificationStatus: update.verificationStatus || base.verificationStatus,
    errorsEncountered: [...base.errorsEncountered, ...(update.errorsEncountered || [])],
    blockers: [...base.blockers, ...(update.blockers || [])],
  };
}
