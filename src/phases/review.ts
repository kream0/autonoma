/**
 * Review Phase
 *
 * QA agent reviews code implementation and triggers retries for failed tasks.
 */

import type { DevTask } from '../types.ts';
import type { PhaseContext } from './types.ts';
import { parseQAOutput } from './parsers.ts';
import { runRetryTasks } from './development.ts';

/**
 * Run review phase and return output for CEO
 */
export async function runReviewPhase(
  ctx: PhaseContext,
  requirements: string
): Promise<string[]> {
  const qaAgent = ctx.findAgentByRole('qa');
  if (!qaAgent) throw new Error('QA agent not found');

  const contextSection = ctx.buildContextSection();
  const batches = ctx.persistedState?.batches || [];
  const maxRetries = 2;
  let retryRound = 0;
  let lastOutput: string[] = [];

  while (true) {
    retryRound++;
    const reviewTask = ctx.createTask(`Review implementation (round ${retryRound})`, qaAgent.state.config.id);
    ctx.updateTaskStatus(reviewTask.id, 'running');

    const completedTasks = batches.flatMap(b => b.tasks)
      .filter(t => t.status === 'complete')
      .map(t => `- Task ${t.id}: ${t.title}${t.files ? ` (${t.files.join(', ')})` : ''}`);

    const qaPrompt = `${contextSection}<task>Review the code in the TARGET PROJECT: ${ctx.workingDir}</task>

<requirements>
${requirements}
</requirements>

<completed_tasks>
${completedTasks.join('\n') || 'No tasks completed yet'}
</completed_tasks>

<instructions>
<step>Navigate to ${ctx.workingDir}</step>
<step>List the files that were created in the project</step>
<step>Run typecheck: npx tsc --noEmit (in ${ctx.workingDir})</step>
<step>Verify the implementation meets the requirements</step>
<step>If any tasks failed, identify them by task ID in your JSON output</step>
</instructions>

<warning>Review ONLY files in ${ctx.workingDir}. Do NOT review or test any parent directories or other projects.</warning>`;

    lastOutput = await ctx.startAgent(qaAgent.state.config.id, qaPrompt);
    await ctx.saveAgentLog(`qa-round-${retryRound}`, lastOutput);

    ctx.updateTaskStatus(reviewTask.id, qaAgent.state.status === 'complete' ? 'complete' : 'failed');

    const qaResult = parseQAOutput(lastOutput);

    if (!qaResult) {
      ctx.emitOutput(qaAgent.state.config.id, '[QA] Could not parse QA output - assuming pass');
      break;
    }

    ctx.emitOutput(qaAgent.state.config.id,
      `[QA] Result: ${qaResult.overallStatus}${qaResult.comments ? ` - ${qaResult.comments}` : ''}`);

    if (qaResult.overallStatus === 'PASS' || qaResult.failedTasks.length === 0) {
      ctx.emitOutput(qaAgent.state.config.id, '[QA] All tasks passed review');
      break;
    }

    // Handle retries
    const tasksToRetry: DevTask[] = [];
    for (const failure of qaResult.failedTasks) {
      const task = batches.flatMap(b => b.tasks).find(t => t.id === failure.taskId);
      if (!task) continue;

      const currentRetries = task.retryCount || 0;
      const taskMaxRetries = task.maxRetries || maxRetries;

      if (currentRetries >= taskMaxRetries) {
        task.status = 'failed';
        task.lastFailureReason = failure.reason;
        continue;
      }

      task.status = 'pending';
      task.retryCount = currentRetries + 1;
      task.lastFailureReason = failure.reason;
      tasksToRetry.push(task);
    }

    if (tasksToRetry.length === 0) break;

    await ctx.saveState();
    await runRetryTasks(ctx, tasksToRetry, contextSection);
  }

  // Store for CEO
  if (ctx.persistedState) {
    ctx.persistedState.lastQaOutput = lastOutput;
  }

  await ctx.completePhase('review');
  return lastOutput;
}
