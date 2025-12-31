/**
 * Development Phase
 *
 * Developers execute coding tasks with parallel execution support.
 * Includes verification after tasks and retry context injection.
 *
 * V2 Updates:
 * - Promise-based completion flow (Ralph-Wiggum style)
 * - Recitation blocks at end of prompts
 * - Multi-stage verification pipeline
 * - Controlled noise in batch prompts
 */

import type { TaskBatch, DevTask } from '../types.ts';
import type { PhaseContext, Agent } from './types.ts';
import { TaskQueue } from '../queue.ts';
import {
  verifyTask,
  allRequiredPassed,
  formatVerificationResults,
} from '../verification/index.ts';
import { buildRetryPrompt } from '../retry/index.ts';
import {
  generateDeveloperRecitation,
  createEmptyProgress,
  type TaskProgress,
} from './recitation.ts';

// Instruction variants for controlled noise
const INSTRUCTION_VARIANTS = [
  'Implement this task now. Create the necessary files.',
  'Execute this task. Write the required code.',
  'Complete this task. Generate the needed files.',
  'Build this task. Produce the required code.',
  'Develop this task. Create the implementation.',
];

/**
 * Get a varied instruction to prevent pattern-matching
 */
function getVariedInstruction(taskId: number): string {
  return INSTRUCTION_VARIANTS[taskId % INSTRUCTION_VARIANTS.length]!;
}

/**
 * Run development phase - execute all batches
 * Developers are spawned dynamically per batch for optimal parallelism
 */
export async function runDevelopmentPhase(
  ctx: PhaseContext,
  requirements: string,
  startFromBatch: number = 0
): Promise<void> {
  const contextSection = ctx.buildContextSection();
  const batches = ctx.persistedState?.batches || [];

  if (batches.length === 0) {
    // Fallback: implement requirements directly with a single developer
    const developers = ctx.spawnDevelopersForBatch(1);
    const devAgent = developers[0];
    if (!devAgent) throw new Error('Failed to spawn developer');

    const task = ctx.createTask('Implement requirements', devAgent.state.config.id);
    ctx.updateTaskStatus(task.id, 'running');

    const devPrompt = `${contextSection}<task>Implement requirements directly (no task breakdown available).</task>

<requirements>
${requirements}
</requirements>

<instructions>Create the necessary files and code to fulfill the requirements.</instructions>`;

    const devOutput = await ctx.startAgent(devAgent.state.config.id, devPrompt);
    await ctx.saveAgentLog('developer', devOutput);

    ctx.updateTaskStatus(task.id, devAgent.state.status === 'complete' ? 'complete' : 'failed');
    ctx.cleanupDevelopers();
    await ctx.completePhase('development');
    return;
  }

  // Execute batches with dynamic developer spawning
  for (let batchIdx = startFromBatch; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    if (!batch || batch.status === 'complete') continue;

    if (ctx.persistedState) {
      ctx.persistedState.currentBatchIndex = batchIdx;
    }
    batch.status = 'running';
    await ctx.saveState();

    const pendingTasks = batch.tasks.filter(t => t.status === 'pending' || t.status === 'running');

    if (pendingTasks.length === 0) {
      batch.status = 'complete';
      continue;
    }

    // Calculate developers needed for this batch
    // Use maxParallelTasks if specified (for complexity control), otherwise spawn one per task
    const developersNeeded = batch.parallel
      ? (batch.maxParallelTasks ?? pendingTasks.length)
      : 1;

    // Spawn developers for this batch
    const developers = ctx.spawnDevelopersForBatch(developersNeeded);

    // Log batch start
    ctx.emitOutput('orchestrator',
      `[BATCH ${batchIdx + 1}/${batches.length}] ${batch.parallel ? 'PARALLEL' : 'SEQUENTIAL'} - ${pendingTasks.length} tasks, ${developers.length} developers`);

    if (batch.parallel && developers.length > 1) {
      // PARALLEL EXECUTION with work-stealing
      await executeTasksInParallel(ctx, batch, pendingTasks, developers, contextSection);
    } else {
      // SEQUENTIAL EXECUTION
      await executeTasksSequentially(ctx, batch, pendingTasks, developers[0]!, contextSection);
    }

    // Cleanup developers after batch (will be recreated for next batch)
    ctx.cleanupDevelopers();

    // Mark batch complete if all tasks done
    const allComplete = batch.tasks.every(t => t.status === 'complete');
    batch.status = allComplete ? 'complete' : 'failed';
    await ctx.saveState();
  }

  await ctx.completePhase('development');
}

/**
 * Execute tasks in parallel using work-stealing queue.
 * Each developer independently pulls tasks when ready.
 * Developers are already spawned with the optimal count for this batch.
 */
async function executeTasksInParallel(
  ctx: PhaseContext,
  _batch: TaskBatch,
  tasks: DevTask[],
  developers: Agent[],
  contextSection: string
): Promise<void> {
  // Create work-stealing queue
  const queue = new TaskQueue(tasks);

  if (developers[0]) {
    ctx.emitOutput(developers[0].state.config.id,
      `[QUEUE] ${queue.getPendingCount()} tasks, ${developers.length} developers (work-stealing)`);
  }

  // Launch all developers as independent workers
  const workerPromises = developers.map(developer =>
    developerWorker(ctx, developer, queue, contextSection)
  );

  // Wait for all workers to finish
  await Promise.all(workerPromises);
}

/**
 * Independent developer worker - pulls tasks from queue until empty
 * Integrates memory retrieval before tasks, verification after, and storage on success
 */
async function developerWorker(
  ctx: PhaseContext,
  developer: Agent,
  queue: TaskQueue,
  contextSection: string
): Promise<void> {
  while (true) {
    // Get next task from queue
    const devTask = queue.getNextTask();
    if (!devTask) {
      // No more tasks - worker is done
      break;
    }

    // Mark task as started
    queue.startTask(developer.state.config.id, devTask);
    await ctx.saveState();

    const task = ctx.createTask(devTask.title, developer.state.config.id);
    ctx.updateTaskStatus(task.id, 'running');

    ctx.emitOutput(developer.state.config.id,
      `[WORK-STEAL] Task ${devTask.id}: ${devTask.title}${devTask.complexity ? ` (${devTask.complexity})` : ''} [${queue.getPendingCount()} remaining]`);

    // Get retry context if this is a retry
    let retrySection = '';
    if (ctx.retryContextStore && devTask.retryCount && devTask.retryCount > 0) {
      const retryCtx = ctx.retryContextStore.get(String(devTask.id));
      if (retryCtx) {
        retrySection = '\n' + buildRetryPrompt(retryCtx) + '\n';
        ctx.emitOutput(developer.state.config.id,
          `[RETRY] Attempt ${retryCtx.previousAttempts + 1} with error context`);
      }
    }

    // Retrieve relevant memories from memorai
    let memorySection = '';
    if (ctx.memorai) {
      try {
        const memories = ctx.memorai.search({
          query: `${devTask.title} ${devTask.description}`,
          limit: 5,
        });
        if (memories.length > 0) {
          memorySection = '\n<relevant_memories>\n' +
            memories.map(m => `<memory>${m.summary || m.title}</memory>`).join('\n') +
            '\n</relevant_memories>\n';
          ctx.emitOutput(developer.state.config.id,
            `[MEMORAI] Retrieved ${memories.length} relevant memories`);
        }
      } catch {
        // Memorai search failed - continue without memories
      }
    }

    // Track progress for recitation (initialized with current state)
    const progress: TaskProgress = createEmptyProgress();
    const iteration = (devTask.retryCount ?? 0) + 1;
    const maxIterations = (devTask.maxRetries ?? 2) + 1;

    // Generate recitation block for end of prompt
    const recitationBlock = generateDeveloperRecitation(
      devTask,
      iteration,
      maxIterations,
      progress
    );

    // Use varied instruction to prevent pattern-matching
    const instruction = getVariedInstruction(devTask.id);

    const devPrompt = `${contextSection}${retrySection}${memorySection}<task>
<id>${devTask.id}</id>
<title>${devTask.title}</title>
<description>${devTask.description}</description>
${devTask.files ? `<files>${devTask.files.join(', ')}</files>` : ''}
${devTask.complexity ? `<complexity>${devTask.complexity}</complexity>` : ''}
${devTask.context ? `<task_context>${devTask.context}</task_context>` : ''}
</task>

<execution_context>
<mode>PARALLEL</mode>
<constraint>Focus ONLY on the files listed above. Other developers are working on other files simultaneously.</constraint>
</execution_context>

<instructions>${instruction}</instructions>

${recitationBlock}`;

    try {
      const devOutput = await ctx.startAgent(developer.state.config.id, devPrompt);
      await ctx.saveAgentLog(`developer-${developer.state.config.name}-task-${devTask.id}`, devOutput);

      const agentSuccess = developer.state.status === 'complete';

      // Run verification if agent completed and verification is configured
      let verificationPassed = true;
      if (agentSuccess && ctx.verificationConfig && ctx.verificationConfig.criteria.length > 0) {
        ctx.emitOutput(developer.state.config.id, `[VERIFY] Running verification...`);

        const results = await verifyTask(
          devTask,
          ctx.workingDir,
          ctx.verificationConfig.criteria
        );

        verificationPassed = allRequiredPassed(results, ctx.verificationConfig.criteria);
        ctx.emitOutput(developer.state.config.id,
          `[VERIFY] ${verificationPassed ? 'PASSED' : 'FAILED'}\n${formatVerificationResults(results)}`);

        // Handle verification failure
        if (!verificationPassed) {
          const maxRetries = devTask.maxRetries ?? 2;
          const currentRetries = devTask.retryCount ?? 0;

          if (currentRetries < maxRetries) {
            // Save retry context and requeue
            if (ctx.retryContextStore) {
              ctx.retryContextStore.incrementAttempts(
                String(devTask.id),
                'Verification failed',
                results.filter(r => !r.passed)
              );
            }

            devTask.retryCount = currentRetries + 1;
            devTask.lastFailureReason = 'Verification failed: ' +
              results.filter(r => !r.passed).map(r => r.type).join(', ');

            queue.requeueTask(devTask);
            ctx.emitOutput(developer.state.config.id,
              `[RETRY] Task ${devTask.id} queued for retry (${currentRetries + 1}/${maxRetries})`);

            // Don't update task status as complete yet
            ctx.updateTaskStatus(task.id, 'pending');
            await ctx.saveState();
            continue; // Move to next task
          } else {
            // Max retries exceeded - queue for human
            if (ctx.humanQueue) {
              const blockerId = ctx.humanQueue.queueBlocker(
                String(devTask.id),
                developer.state.config.id,
                `Task failed after ${maxRetries} attempts. Last failures: ${
                  results.filter(r => !r.passed).map(r => `${r.type}: ${r.message}`).join('; ')
                }`
              );
              ctx.emitOutput(developer.state.config.id,
                `[BLOCKED] Task ${devTask.id} queued for human: ${blockerId}`);
            }
          }
        }
      }

      const finalSuccess = agentSuccess && verificationPassed;
      queue.completeTask(developer.state.config.id, finalSuccess);
      ctx.updateTaskStatus(task.id, finalSuccess ? 'complete' : 'failed');

      // Store learnings on success
      if (finalSuccess) {
        // Clear retry context on success
        ctx.retryContextStore?.clear(String(devTask.id));

        // Parse worker result and store learnings in memorai
        const workerResult = ctx.protocolParser.parseWorkerResult(devOutput);
        if (workerResult && workerResult.learnings.length > 0) {
          // Store learnings in memorai
          if (ctx.memorai) {
            try {
              for (const learning of workerResult.learnings) {
                ctx.memorai.store({
                  category: learning.category as 'architecture' | 'decisions' | 'reports' | 'summaries' | 'structure' | 'notes',
                  title: `Task ${devTask.id}: ${devTask.title}`,
                  content: learning.content,
                  tags: [`task-${devTask.id}`, developer.state.config.id],
                  importance: learning.importance as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
                });
              }
              ctx.emitOutput(developer.state.config.id,
                `[MEMORAI] Stored ${workerResult.learnings.length} learnings`);
            } catch {
              // Memorai store failed - continue without storing
            }
          }
        }
      }
    } catch (error) {
      queue.completeTask(developer.state.config.id, false);
      ctx.updateTaskStatus(task.id, 'failed');
      ctx.emitOutput(developer.state.config.id, `[ERROR] Task ${devTask.id} failed: ${error}`);
    }

    await ctx.saveState();
    // Loop continues - worker picks up next task immediately
  }
}

/**
 * Execute tasks sequentially with a single developer
 */
async function executeTasksSequentially(
  ctx: PhaseContext,
  _batch: TaskBatch,
  tasks: DevTask[],
  developer: Agent,
  contextSection: string
): Promise<void> {
  for (const devTask of tasks) {
    if (devTask.status === 'complete') continue;

    devTask.status = 'running';
    devTask.assignedTo = developer.state.config.id;
    await ctx.saveState();

    const task = ctx.createTask(devTask.title, developer.state.config.id);
    ctx.updateTaskStatus(task.id, 'running');

    ctx.emitOutput(developer.state.config.id,
      `[SEQUENTIAL] Task ${devTask.id}: ${devTask.title}${devTask.complexity ? ` (${devTask.complexity})` : ''}`);

    // Retrieve relevant memories for this task
    let memorySection = '';
    if (ctx.memorai) {
      try {
        const memories = ctx.memorai.search({
          query: `${devTask.title} ${devTask.description}`,
          limit: 5,
        });
        if (memories.length > 0) {
          memorySection = '\n<relevant_memories>\n' +
            memories.map(m => `<memory>${m.summary || m.title}</memory>`).join('\n') +
            '\n</relevant_memories>\n';
          ctx.emitOutput(developer.state.config.id,
            `[MEMORAI] Retrieved ${memories.length} relevant memories`);
        }
      } catch {
        // Memorai search failed - continue without memories
      }
    }

    // Track progress for recitation
    const progress: TaskProgress = createEmptyProgress();
    const iteration = (devTask.retryCount ?? 0) + 1;
    const maxIterations = (devTask.maxRetries ?? 2) + 1;

    // Generate recitation block for end of prompt
    const recitationBlock = generateDeveloperRecitation(
      devTask,
      iteration,
      maxIterations,
      progress
    );

    // Use varied instruction
    const instruction = getVariedInstruction(devTask.id);

    const devPrompt = `${contextSection}${memorySection}<task>
<id>${devTask.id}</id>
<title>${devTask.title}</title>
<description>${devTask.description}</description>
${devTask.files ? `<files>${devTask.files.join(', ')}</files>` : ''}
${devTask.complexity ? `<complexity>${devTask.complexity}</complexity>` : ''}
${devTask.context ? `<task_context>${devTask.context}</task_context>` : ''}
</task>

<execution_context>
<mode>SEQUENTIAL</mode>
</execution_context>

<instructions>${instruction}</instructions>

${recitationBlock}`;

    try {
      const devOutput = await ctx.startAgent(developer.state.config.id, devPrompt);
      await ctx.saveAgentLog(`developer-task-${devTask.id}`, devOutput);

      const success = developer.state.status === 'complete';
      devTask.status = success ? 'complete' : 'failed';
      ctx.updateTaskStatus(task.id, devTask.status);

      // Parse worker result and store learnings
      if (success && ctx.memorai) {
        const workerResult = ctx.protocolParser.parseWorkerResult(devOutput);
        if (workerResult && workerResult.learnings.length > 0) {
          try {
            for (const learning of workerResult.learnings) {
              ctx.memorai.store({
                category: learning.category as 'architecture' | 'decisions' | 'reports' | 'summaries' | 'structure' | 'notes',
                title: `Task ${devTask.id}: ${devTask.title}`,
                content: learning.content,
                tags: [`task-${devTask.id}`, developer.state.config.id],
                importance: learning.importance as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
              });
            }
            ctx.emitOutput(developer.state.config.id,
              `[MEMORAI] Stored ${workerResult.learnings.length} learnings from task`);
          } catch {
            // Memorai store failed - continue
          }
        }
      }
    } catch (error) {
      devTask.status = 'failed';
      ctx.updateTaskStatus(task.id, 'failed');
      ctx.emitOutput(developer.state.config.id, `[ERROR] Task ${devTask.id} failed: ${error}`);
    }

    await ctx.saveState();
  }
}

/**
 * Re-run specific failed tasks
 */
export async function runRetryTasks(
  ctx: PhaseContext,
  tasks: DevTask[],
  contextSection: string
): Promise<void> {
  // Spawn a single developer for retries (sequential to avoid conflicts)
  const developers = ctx.spawnDevelopersForBatch(1);
  const developer = developers[0];
  if (!developer) throw new Error('Failed to spawn developer for retries');

  for (const devTask of tasks) {
    devTask.status = 'running';
    devTask.assignedTo = developer.state.config.id;
    await ctx.saveState();

    const task = ctx.createTask(`Retry: ${devTask.title}`, developer.state.config.id);
    ctx.updateTaskStatus(task.id, 'running');

    ctx.emitOutput(developer.state.config.id,
      `[RETRY] Task ${devTask.id}: ${devTask.title} (attempt ${devTask.retryCount})`);

    const devPrompt = `${contextSection}<task>
<id>${devTask.id}</id>
<title>${devTask.title}</title>
<description>${devTask.description}</description>
${devTask.files ? `<files>${devTask.files.join(', ')}</files>` : ''}
${devTask.complexity ? `<complexity>${devTask.complexity}</complexity>` : ''}
${devTask.context ? `<task_context>${devTask.context}</task_context>` : ''}
</task>

<retry_context>
<attempt>${devTask.retryCount}</attempt>
<previous_failure>${devTask.lastFailureReason || 'Unknown'}</previous_failure>
<instruction>This task failed QA review. Fix the issue identified above.</instruction>
</retry_context>

<instructions>Fix the issues and complete this task correctly.</instructions>`;

    try {
      const devOutput = await ctx.startAgent(developer.state.config.id, devPrompt);
      await ctx.saveAgentLog(`developer-retry-${devTask.id}-attempt-${devTask.retryCount}`, devOutput);

      devTask.status = developer.state.status === 'complete' ? 'complete' : 'failed';
      ctx.updateTaskStatus(task.id, devTask.status);
    } catch (error) {
      devTask.status = 'failed';
      ctx.updateTaskStatus(task.id, 'failed');
      ctx.emitOutput(developer.state.config.id, `[ERROR] Retry of task ${devTask.id} failed: ${error}`);
    }

    await ctx.saveState();
  }

  // Cleanup developer after retries
  ctx.cleanupDevelopers();
}
