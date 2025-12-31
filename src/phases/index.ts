/**
 * Phases Module
 *
 * Orchestration phases extracted for modularity.
 */

// Types
export type {
  Agent,
  PhaseContext,
  WorkerResult,
  CycleResult,
  TestResult,
  ApprovalResult,
} from './types.ts';

// Prompts and configuration
export { SYSTEM_PROMPTS, TILE_RATIOS } from './prompts.ts';

// Parsers
export {
  parseJsonFromOutput,
  parseQAOutput,
  parseTestOutput,
  parseCeoDecision,
  type ParsedPlan,
  type ParsedBatches,
  type ParsedTasks,
  type ParsedQAResult,
  type ParsedTestResult,
  type ParsedCeoDecision,
} from './parsers.ts';

// Phase functions
export { runPlanningPhase, runAdoptPhase, runReplanPhase } from './planning.ts';
export { runTaskBreakdownPhase } from './task-breakdown.ts';
export { runDevelopmentPhase, runRetryTasks } from './development.ts';
export { runTestingPhase } from './testing.ts';
export { runReviewPhase } from './review.ts';
export { runCeoApprovalPhase } from './ceo-approval.ts';
