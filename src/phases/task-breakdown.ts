/**
 * Task Breakdown Phase
 *
 * Staff Engineer breaks milestones into specific coding tasks with batching.
 */

import type { TaskBatch } from '../types.ts';
import type { PhaseContext } from './types.ts';
import { parseJsonFromOutput, type ParsedBatches, type ParsedTasks } from './parsers.ts';

/**
 * Convert legacy flat tasks to batch format
 */
function convertLegacyTasksToBatches(tasks: ParsedTasks['tasks']): TaskBatch[] {
  return [{
    batchId: 1,
    tasks: tasks.map(t => ({
      ...t,
      status: 'pending' as const,
    })),
    parallel: false,
    status: 'pending',
  }];
}

/**
 * Run task breakdown phase - Staff Engineer creates batched tasks
 * Developers are spawned dynamically per batch based on task count
 */
export async function runTaskBreakdownPhase(
  ctx: PhaseContext,
  requirements: string
): Promise<TaskBatch[]> {
  const staffAgent = ctx.findAgentByRole('staff');
  if (!staffAgent) throw new Error('Staff Engineer agent not found');

  const breakdownTask = ctx.createTask('Break plan into development tasks', staffAgent.state.config.id);
  ctx.updateTaskStatus(breakdownTask.id, 'running');

  const contextSection = ctx.buildContextSection();
  const plan = ctx.persistedState?.plan;

  const milestoneText = plan?.milestones
    ? plan.milestones.map(m => `<milestone id="${m.id}">${m.title}: ${m.description}</milestone>`).join('\n')
    : `<fallback>Based on requirements directly</fallback>\n${requirements}`;

  const staffPrompt = `${contextSection}<task>Break down milestones into specific coding tasks.</task>

<context>
<execution_mode>DYNAMIC PARALLELISM - developers spawned per batch based on task count</execution_mode>
<parallelism_note>For each parallel batch, we spawn exactly as many developers as there are tasks (100% efficiency)</parallelism_note>
</context>

<milestones>
${milestoneText}
</milestones>

<instructions>
<step>Group tasks into batches</step>
<step>Tasks in parallel batches will be executed simultaneously by different developers</step>
<step>Ensure tasks in parallel batches touch DIFFERENT files to avoid conflicts</step>
<step>Use maxParallelTasks per batch to limit parallelism for complex tasks that need more context</step>
</instructions>`;

  const staffOutput = await ctx.startAgent(staffAgent.state.config.id, staffPrompt);
  await ctx.saveAgentLog('staff', staffOutput);

  ctx.updateTaskStatus(breakdownTask.id, staffAgent.state.status === 'complete' ? 'complete' : 'failed');

  // Try to parse as new batch format first
  const parsed = parseJsonFromOutput(staffOutput);
  let batches: TaskBatch[] = [];

  if (parsed && 'batches' in (parsed as object)) {
    const batchedPlan = parsed as ParsedBatches;

    // Log any reasoning from Staff Engineer (recommendedDevelopers is obsolete - we spawn dynamically)
    if (batchedPlan.reasoning) {
      ctx.emitOutput(staffAgent.state.config.id,
        `[COMPLEXITY] Staff analysis: ${batchedPlan.reasoning}`);
    }

    // Store batches with complexity and context info
    batches = batchedPlan.batches.map(b => ({
      batchId: b.batchId,
      tasks: b.tasks.map(t => ({
        ...t,
        status: 'pending' as const,
        complexity: t.complexity,
        context: t.context,
      })),
      parallel: b.parallel,
      maxParallelTasks: b.maxParallelTasks,
      status: 'pending' as const,
    }));

    const totalTasks = batchedPlan.batches.reduce((sum, b) => sum + b.tasks.length, 0);
    const parallelBatches = batchedPlan.batches.filter(b => b.parallel).length;
    ctx.emitOutput(staffAgent.state.config.id,
      `[INFO] Created ${batchedPlan.batches.length} batches with ${totalTasks} total tasks (${parallelBatches} parallel batches)`);
  } else if (parsed && 'tasks' in (parsed as object)) {
    // Legacy format - convert to batches
    const legacyPlan = parsed as ParsedTasks;
    batches = convertLegacyTasksToBatches(legacyPlan.tasks);
    ctx.emitOutput(staffAgent.state.config.id,
      `[INFO] Created ${legacyPlan.tasks.length} tasks (legacy format, running sequentially)`);
  }

  if (ctx.persistedState) {
    ctx.persistedState.batches = batches;
  }

  await ctx.completePhase('task-breakdown');
  return batches;
}
