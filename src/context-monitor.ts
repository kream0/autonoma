/**
 * Context Window Monitor
 *
 * Tracks token usage per agent and triggers awareness injection
 * at configurable thresholds (50%, 60%, 70%, 80%).
 * At 80%, requests handoff block from agent for graceful replacement.
 */

import type {
  AgentContextState,
  ContextThreshold,
  TokenUsage,
} from './types.ts';

/** Default context limit for Claude Opus (200k tokens) */
const DEFAULT_CONTEXT_LIMIT = 200_000;

/** Thresholds and their corresponding actions (75% triggers handoff for better buffer) */
const THRESHOLDS: ContextThreshold[] = [40, 50, 60, 70, 75];

/** Context awareness messages for each threshold level */
const CONTEXT_MESSAGES: Record<ContextThreshold, string> = {
  40: `<context_status level="40">
REMINDER: You have used 40% of your available context window.
Stay focused on your current objective. Avoid tangential exploration.
Complete your current work efficiently before moving on.
</context_status>`,

  50: `<context_status level="50">
You have used approximately half of your available context window.
Continue working normally. No action required.
</context_status>`,

  60: `<context_status level="60">
Context usage: 60%. Begin wrapping up any exploratory work.
If starting a new subtask, prefer smaller, self-contained changes.
Continue with your current work.
</context_status>`,

  70: `<context_status level="70">
Context usage: 70%. Complete your current task unit, then pause.
Do not begin new complex operations. Document any work-in-progress.
After completing immediate work, await further instructions.
</context_status>`,

  75: `<context_status level="75" action="handoff">
Context usage: 75%. STOP current work and prepare handoff.

Output a <handoff> block with the following structure:

<handoff task_id="[CURRENT_TASK_ID]" agent="[YOUR_AGENT_ID]">
  <status>[pending | in_progress | blocked | nearly_complete]</status>
  <files_modified>
    <file path="[file path]" lines="[line range]" functions="[function/class names]"/>
    <!-- Add all files you have modified -->
  </files_modified>
  <files_to_touch>
    <file path="[file path]" reason="[why this file needs work]"/>
    <!-- Add all files that still need work -->
  </files_to_touch>
  <current_state>[What you were doing when stopped]</current_state>
  <blockers>[Any issues encountered and how you addressed them]</blockers>
  <next_steps>[Specific actions for the replacement agent, numbered]</next_steps>
  <context>[Any insights, gotchas, or recommendations for the next agent]</context>
</handoff>

A new agent will continue from your handoff. Be precise and actionable.
</context_status>`,
};

export interface ContextMonitorEvents {
  onThresholdReached: (agentId: string, threshold: ContextThreshold, message: string) => void;
  onHandoffRequired: (agentId: string) => void;
}

export class ContextMonitor {
  private agents: Map<string, AgentContextState> = new Map();
  private events: ContextMonitorEvents;
  private contextLimit: number;

  constructor(events: ContextMonitorEvents, contextLimit: number = DEFAULT_CONTEXT_LIMIT) {
    this.events = events;
    this.contextLimit = contextLimit;
  }

  /**
   * Register an agent for monitoring
   */
  registerAgent(agentId: string): void {
    this.agents.set(agentId, {
      agentId,
      totalTokens: 0,
      contextLimit: this.contextLimit,
      percentUsed: 0,
      lastThresholdNotified: null,
      handoffRequested: false,
    });
  }

  /**
   * Unregister an agent (e.g., when replaced)
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  /**
   * Update token usage for an agent
   * Called after each agent response with cumulative token counts
   */
  updateTokenUsage(agentId: string, usage: TokenUsage): void {
    const state = this.agents.get(agentId);
    if (!state) return;

    state.totalTokens = usage.inputTokens + usage.outputTokens;
    state.percentUsed = Math.round((state.totalTokens / state.contextLimit) * 100);

    // Check thresholds
    this.checkThresholds(state);
  }

  /**
   * Check if any new thresholds have been crossed
   */
  private checkThresholds(state: AgentContextState): void {
    for (const threshold of THRESHOLDS) {
      if (state.percentUsed >= threshold) {
        // Only notify if we haven't notified for this threshold yet
        if (state.lastThresholdNotified === null || threshold > state.lastThresholdNotified) {
          state.lastThresholdNotified = threshold;

          const message = CONTEXT_MESSAGES[threshold];
          this.events.onThresholdReached(state.agentId, threshold, message);

          // At 75%, also trigger handoff requirement (lowered from 80% for better buffer)
          if (threshold === 75 && !state.handoffRequested) {
            state.handoffRequested = true;
            this.events.onHandoffRequired(state.agentId);
          }
        }
      }
    }
  }

  /**
   * Get current context state for an agent
   */
  getAgentState(agentId: string): AgentContextState | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all monitored agents
   */
  getAllAgentStates(): AgentContextState[] {
    return Array.from(this.agents.values());
  }

  /**
   * Check if an agent needs handoff
   */
  needsHandoff(agentId: string): boolean {
    const state = this.agents.get(agentId);
    return state?.handoffRequested ?? false;
  }

  /**
   * Get the appropriate context awareness message to prepend to next prompt
   * Returns null if no message needed (no new threshold crossed)
   */
  getContextAwarenessMessage(agentId: string): string | null {
    const state = this.agents.get(agentId);
    if (!state || state.lastThresholdNotified === null) {
      return null;
    }

    // Return the message for the current threshold level
    return CONTEXT_MESSAGES[state.lastThresholdNotified];
  }

  /**
   * Reset agent state (e.g., after replacement)
   */
  resetAgent(agentId: string): void {
    const state = this.agents.get(agentId);
    if (state) {
      state.totalTokens = 0;
      state.percentUsed = 0;
      state.lastThresholdNotified = null;
      state.handoffRequested = false;
    }
  }

  /**
   * Get context usage percentage for display
   */
  getContextPercentage(agentId: string): number {
    return this.agents.get(agentId)?.percentUsed ?? 0;
  }

  /**
   * Check if an agent is approaching context limit (>= 70%)
   */
  isApproachingLimit(agentId: string): boolean {
    const state = this.agents.get(agentId);
    return state ? state.percentUsed >= 70 : false;
  }

  /**
   * Get summary of all agents' context usage
   */
  getSummary(): Array<{ agentId: string; percent: number; needsHandoff: boolean }> {
    return Array.from(this.agents.values()).map(state => ({
      agentId: state.agentId,
      percent: state.percentUsed,
      needsHandoff: state.handoffRequested,
    }));
  }

  /**
   * Get 40% objective reminder with task context
   */
  getObjectiveReminder(
    agentId: string,
    taskTitle?: string,
    completionCriteria?: string
  ): string | null {
    const state = this.agents.get(agentId);
    if (!state || state.lastThresholdNotified !== 40) {
      return null;
    }

    if (!taskTitle) return CONTEXT_MESSAGES[40];

    return `<context_status level="40">
REMINDER: You are 40% through available context.
Current objective: ${taskTitle}
${completionCriteria ? `Completion criteria: ${completionCriteria}` : ''}
Stay focused on the task at hand.
</context_status>`;
  }
}
