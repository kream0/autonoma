/**
 * Agent-related types
 */

/** Agent roles in the hierarchy */
export type AgentRole = 'ceo' | 'staff' | 'developer' | 'qa' | 'e2e';

/** Agent status */
export type AgentStatus = 'idle' | 'running' | 'complete' | 'error';

/** Permission mode for Claude Code CLI */
export type PermissionMode = 'plan' | 'full';

/** Agent configuration */
export interface AgentConfig {
  id: string;
  role: AgentRole;
  name: string;
  systemPrompt?: string;
  workingDir: string;
  permissionMode: PermissionMode;
}

/** Token usage tracking */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
}

/** Agent state at runtime */
export interface AgentState {
  config: AgentConfig;
  status: AgentStatus;
  output: string[];
  startTime?: Date;
  endTime?: Date;
  error?: string;
  tokenUsage: TokenUsage;
}

/** Context threshold levels for awareness injection */
export type ContextThreshold = 40 | 50 | 60 | 70 | 80;

/** Watchdog decision types */
export type WatchdogDecision = 'respawn' | 'inject_guidance' | 'continue' | 'escalate_to_user';

/** Context monitor state for an agent */
export interface AgentContextState {
  agentId: string;
  totalTokens: number;
  contextLimit: number;
  percentUsed: number;
  lastThresholdNotified: ContextThreshold | null;
  handoffRequested: boolean;
}

/** Health monitor status for an agent */
export interface AgentHealthStatus {
  agentId: string;
  isHealthy: boolean;
  lastOutputTime: Date;
  errorCount: number;
  lastError?: string;
  isStuck: boolean;
}
