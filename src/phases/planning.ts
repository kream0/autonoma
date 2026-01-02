/**
 * Planning Phase
 *
 * CEO analyzes requirements and creates a high-level plan with milestones.
 */

import type { PhaseContext } from './types.ts';
import { parseJsonFromOutput, type ParsedPlan } from './parsers.ts';

/**
 * Run planning phase - CEO creates milestones
 */
export async function runPlanningPhase(
  ctx: PhaseContext,
  requirements: string
): Promise<ParsedPlan | null> {
  const ceoAgent = ctx.findAgentByRole('ceo');
  if (!ceoAgent) throw new Error('CEO agent not found');

  const planTask = ctx.createTask('Analyze requirements and create plan', ceoAgent.state.config.id);
  ctx.updateTaskStatus(planTask.id, 'running');

  const contextSection = ctx.buildContextSection();
  if (ctx.projectContext) {
    ctx.emitOutput(ceoAgent.state.config.id, '[INFO] Found CLAUDE.md - using project context for planning');
  }
  if (ctx.projectDocs.size > 0) {
    const docNames = Array.from(ctx.projectDocs.keys()).join(', ');
    ctx.emitOutput(ceoAgent.state.config.id, `[INFO] Found project docs: ${docNames}`);
  }

  // Search memorai for relevant architecture and decisions
  let memorySection = '';
  if (ctx.memorai) {
    try {
      // Search architecture memories
      const archMemories = ctx.memorai.search({
        query: 'architecture design patterns',
        limit: 5,
        category: 'architecture',
      });

      // Search past decisions
      const decisions = ctx.memorai.search({
        query: 'decision rationale',
        limit: 5,
        category: 'decisions',
      });

      const allMemories = [...archMemories, ...decisions];
      if (allMemories.length > 0) {
        memorySection = `
<project_memory>
<description>Relevant memories from previous sessions.</description>
${allMemories.map(m => `<memory category="${m.category}" importance="${m.importance}">
${m.summary || m.title}
</memory>`).join('\n')}
</project_memory>

`;
        ctx.emitOutput(ceoAgent.state.config.id,
          `[MEMORAI] Found ${allMemories.length} relevant memories for planning`);
      }
    } catch (error) {
      ctx.emitOutput(ceoAgent.state.config.id,
        `[MEMORAI] Warning: Memory search failed: ${error}`);
    }
  }

  const ceoPrompt = `${contextSection}${memorySection}<task>Analyze requirements and create a development plan.</task>

<requirements>
${requirements}
</requirements>`;

  const ceoOutput = await ctx.startAgent(ceoAgent.state.config.id, ceoPrompt);
  await ctx.saveAgentLog('ceo', ceoOutput);

  ctx.updateTaskStatus(planTask.id, ceoAgent.state.status === 'complete' ? 'complete' : 'failed');

  // Parse and save the plan
  const plan = parseJsonFromOutput(ceoOutput) as ParsedPlan | null;

  if (plan?.milestones?.length) {
    if (ctx.persistedState) {
      ctx.persistedState.plan = plan;
    }
    if (plan.summary) {
      ctx.emitOutput(ceoAgent.state.config.id, `[CEO] Decision: ${plan.summary}`);
    }
    ctx.emitOutput(ceoAgent.state.config.id, `[INFO] Plan created with ${plan.milestones.length} milestones`);
  } else {
    ctx.emitOutput(ceoAgent.state.config.id, '[Note: No structured plan found, using direct execution]');
  }

  await ctx.completePhase('planning');
  return plan;
}

/**
 * Adopt an existing project - CEO analyzes what exists and plans remaining work
 */
export async function runAdoptPhase(
  ctx: PhaseContext,
  requirements: string,
  userContextSection: string
): Promise<ParsedPlan | null> {
  const ceoAgent = ctx.findAgentByRole('ceo');
  if (!ceoAgent) throw new Error('CEO agent not found');

  const projectContextSection = ctx.buildContextSection();

  // Build prompt with context-aware instructions
  const hasContext = userContextSection.length > 0;
  const analysisInstructions = hasContext
    ? `<instructions>
<step>Use the provided context files to understand the codebase structure</step>
<step>Only verify critical implementation details - trust the context for structure</step>
<step>Identify what has already been implemented based on the context</step>
<step>Create a plan for the REMAINING work only</step>
<step>Output milestones for what still needs to be done</step>
</instructions>`
    : `<instructions>
<step>Analyze the current state of the codebase</step>
<step>Identify what has already been implemented</step>
<step>Create a plan for the REMAINING work only</step>
<step>Output milestones for what still needs to be done</step>
</instructions>`;

  const adoptPrompt = `${userContextSection}${projectContextSection}<task>Adopt an existing project that may have partial implementation.</task>

<requirements>
${requirements}
</requirements>

${analysisInstructions}

<output_format>
Your output MUST end with a JSON block containing the plan for remaining work:
\`\`\`json
{
  "milestones": [
    {"id": 1, "title": "...", "description": "..."},
    {"id": 2, "title": "...", "description": "..."}
  ]
}
\`\`\`
</output_format>

<completion_signal>Signal completion with [PLAN_COMPLETE] after the JSON.</completion_signal>`;

  const output = await ctx.startAgent(ceoAgent.state.config.id, adoptPrompt);
  await ctx.saveAgentLog('ceo-adopt', output);

  // Parse the plan
  const plan = parseJsonFromOutput(output) as ParsedPlan | null;

  if (plan?.milestones?.length) {
    if (ctx.persistedState) {
      ctx.persistedState.plan = plan;
    }
    if (plan.summary) {
      ctx.emitOutput(ceoAgent.state.config.id, `[CEO] Decision: ${plan.summary}`);
    }
    ctx.emitOutput(ceoAgent.state.config.id, `[ADOPT] Found ${plan.milestones.length} milestones for remaining work`);
  } else {
    ctx.emitOutput(ceoAgent.state.config.id, '[ADOPT] No structured plan found, will analyze requirements directly');
  }

  await ctx.completePhase('planning');
  return plan;
}

/**
 * Replan based on user guidance - CEO creates updated milestones
 */
export async function runReplanPhase(
  ctx: PhaseContext,
  requirements: string,
  guidance: string
): Promise<ParsedPlan | null> {
  const ceoAgent = ctx.findAgentByRole('ceo');
  if (!ceoAgent) throw new Error('CEO agent not found');

  ctx.emitOutput(ceoAgent.state.config.id, '[REPLAN] Processing user guidance...');

  const contextSection = ctx.buildContextSection();
  const currentPlan = ctx.persistedState?.plan;
  const currentMilestones = currentPlan?.milestones
    ? currentPlan.milestones.map(m => `- ${m.title}: ${m.description}`).join('\n')
    : 'No previous milestones';

  const ceoReplanPrompt = `${contextSection}<user_guidance_replan>
<context>The user has provided guidance that requires replanning the project.</context>

<user_guidance>
${guidance}
</user_guidance>

<original_requirements>
${requirements.slice(0, 3000)}
</original_requirements>

<current_milestones>
${currentMilestones}
</current_milestones>

<instructions>
<step>Analyze the user's guidance</step>
<step>Determine what changes are needed to the project plan</step>
<step>Create UPDATED milestones that incorporate the user's guidance</step>
<step>Include both remaining original work AND new work from guidance</step>
</instructions>

<output_format>
Briefly explain what changes you're making, then output the updated plan:
\`\`\`json
{
  "milestones": [
    {"id": 1, "title": "...", "description": "..."},
    {"id": 2, "title": "...", "description": "..."}
  ]
}
\`\`\`
</output_format>

<completion_signal>Signal completion with [REPLAN_COMPLETE] after the JSON.</completion_signal>
</user_guidance_replan>`;

  const output = await ctx.startAgent(ceoAgent.state.config.id, ceoReplanPrompt);
  await ctx.saveAgentLog('ceo-replan', output);

  const updatedPlan = parseJsonFromOutput(output) as ParsedPlan | null;

  if (!updatedPlan?.milestones?.length) {
    ctx.emitOutput(ceoAgent.state.config.id, '[REPLAN] Failed to parse updated milestones');
    return null;
  }

  // Update persisted state with new plan
  if (ctx.persistedState) {
    ctx.persistedState.plan = updatedPlan;
    ctx.persistedState.completedPhases = ctx.persistedState.completedPhases.filter(
      p => p !== 'task-breakdown' && p !== 'development' && p !== 'testing' && p !== 'review' && p !== 'ceo-approval'
    );
  }

  if (updatedPlan.summary) {
    ctx.emitOutput(ceoAgent.state.config.id, `[CEO] Decision: ${updatedPlan.summary}`);
  }
  ctx.emitOutput(ceoAgent.state.config.id, `[REPLAN] Created ${updatedPlan.milestones.length} updated milestones`);
  return updatedPlan;
}
