/**
 * Phase Types
 *
 * Shared types for phase modules.
 */

import type { AgentRole, AgentState, Task, PersistedState } from '../types.ts';
import type { ClaudeSession } from '../session.ts';
import type { ProtocolParser } from '../protocol/parser.ts';
import type { MemoraiClient } from 'memorai';
import type { HumanQueue } from '../human-queue/index.ts';
import type { VerificationConfig } from '../verification/types.ts';
import type { RetryContextStore } from '../retry/index.ts';

/**
 * Agent with state and session
 */
export interface Agent {
  state: AgentState;
  session: ClaudeSession;
}

/**
 * Phase context - provides access to orchestrator capabilities
 * Passed to phase functions to decouple them from the Orchestrator class
 */
export interface PhaseContext {
  // Working directory
  workingDir: string;

  // State
  persistedState: PersistedState | null;
  projectContext: string | null;
  projectDocs: Map<string, string>;

  // Settings
  maxDevelopers: number;

  // Memory system - memorai
  memorai: MemoraiClient | null;
  protocolParser: ProtocolParser;

  // Supervisor features
  humanQueue: HumanQueue | null;
  verificationConfig: VerificationConfig | null;
  retryContextStore: RetryContextStore | null;

  // Agent methods
  findAgentByRole(role: AgentRole): Agent | undefined;
  getDeveloperAgents(): Agent[];
  startAgent(agentId: string, prompt: string): Promise<string[]>;
  createTask(description: string, agentId?: string): Task;
  updateTaskStatus(taskId: string, status: Task['status']): void;

  // State methods
  saveState(): Promise<void>;
  saveAgentLog(role: string, output: string[]): Promise<void>;
  completePhase(phase: PersistedState['phase']): Promise<void>;

  // Events
  emitOutput(agentId: string, line: string): void;

  // Context building
  buildContextSection(): string;
}

/**
 * Result from development phase worker
 */
export interface WorkerResult {
  taskId: number;
  success: boolean;
  output: string[];
}

/**
 * Result from a full cycle
 */
export interface CycleResult {
  approved: boolean;
  feedback?: string;
  hasFailures: boolean;
}

/**
 * Result from testing phase
 */
export interface TestResult {
  passed: boolean;
  output: string[];
}

/**
 * Result from CEO approval phase
 */
export interface ApprovalResult {
  approved: boolean;
  feedback: string;
}
