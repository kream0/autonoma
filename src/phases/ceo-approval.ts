/**
 * CEO Approval Phase
 *
 * CEO reviews test results and QA feedback, decides to approve or reject.
 */

import type { PhaseContext, ApprovalResult } from './types.ts';
import { parseCeoDecision } from './parsers.ts';

/**
 * Run CEO approval phase - final review and decision
 */
export async function runCeoApprovalPhase(
  ctx: PhaseContext,
  requirements: string,
  testOutput: string[],
  qaOutput: string[]
): Promise<ApprovalResult> {
  const ceoAgent = ctx.findAgentByRole('ceo');
  if (!ceoAgent) throw new Error('CEO agent not found');

  const approvalTask = ctx.createTask('CEO final approval', ceoAgent.state.config.id);
  ctx.updateTaskStatus(approvalTask.id, 'running');

  const contextSection = ctx.buildContextSection();
  const approvalPrompt = `${contextSection}<task>Review the project completion and provide final approval.</task>

<original_requirements>
${requirements}
</original_requirements>

<test_results>
${testOutput.slice(-50).join('\n')}
</test_results>

<qa_review>
${qaOutput.slice(-50).join('\n')}
</qa_review>

<instructions>
<step>Review test results - are all critical tests passing?</step>
<step>Review QA assessment - does it meet requirements?</step>
<step>Decide: APPROVE if ready, REJECT if changes needed</step>
<step>If rejecting, specify exactly what needs to be fixed</step>
</instructions>

<output_format>
Your output MUST end with a JSON block:
\`\`\`json
{
  "decision": "APPROVE" | "REJECT",
  "confidence": "high" | "medium" | "low",
  "summary": "Brief explanation of decision",
  "requiredChanges": [
    {"description": "What needs to be fixed", "priority": "high" | "medium"}
  ]
}
\`\`\`
</output_format>

<completion_signal>Signal completion with [CEO_DECISION] after the JSON.</completion_signal>`;

  const output = await ctx.startAgent(ceoAgent.state.config.id, approvalPrompt);
  await ctx.saveAgentLog('ceo-approval', output);

  const decision = parseCeoDecision(output);
  const approved = decision?.decision === 'APPROVE';

  ctx.updateTaskStatus(approvalTask.id, approved ? 'complete' : 'failed');

  const feedback = decision?.requiredChanges?.map(c => c.description).join('; ') || '';

  ctx.emitOutput(ceoAgent.state.config.id,
    `[CEO] Decision: ${decision?.decision || 'UNKNOWN'}${decision?.summary ? ` - ${decision.summary}` : ''}`);

  if (approved) {
    // Clear feedback on approval
    if (ctx.persistedState) {
      ctx.persistedState.ceoFeedback = undefined;
      await ctx.saveState();
    }
    await ctx.completePhase('ceo-approval');
  } else if (ctx.persistedState) {
    // Store feedback for retry loop
    ctx.persistedState.ceoFeedback = feedback;
    ctx.persistedState.ceoApprovalAttempts = (ctx.persistedState.ceoApprovalAttempts || 0) + 1;
    await ctx.saveState();
  }

  return { approved, feedback };
}
