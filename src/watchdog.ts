/**
 * Health Monitoring and Watchdog
 *
 * Implements hybrid monitoring:
 * - Programmatic monitors (always-on, cheap): exit codes, timeouts, error patterns
 * - Claude watchdog (on-demand): invoked for ambiguous situations
 */

import type {
  AgentHealthStatus,
  AgentRole,
  WatchdogDecision,
} from './types.ts';

/** Timeout threshold - no output for this many ms triggers investigation */
const TIMEOUT_THRESHOLD_MS = 5 * 60 * 1000;  // 5 minutes

/** Error patterns that indicate problems */
const ERROR_PATTERNS = [
  /error:/i,
  /exception:/i,
  /fatal:/i,
  /\[ERROR\]/,
  /context.*exceeded/i,
  /rate.*limit/i,
  /autocompact/i,
];

/** Max consecutive errors before triggering watchdog */
const MAX_ERROR_COUNT = 3;

export interface WatchdogEvents {
  onHealthIssue: (agentId: string, issue: string) => void;
  onWatchdogDecision: (agentId: string, decision: WatchdogDecision, reason: string) => void;
}

export interface WatchdogInvoker {
  /**
   * Invoke Claude watchdog for a complex decision
   * Returns the decision and reasoning
   */
  invokeWatchdog: (
    agentId: string,
    agentRole: AgentRole,
    recentOutput: string[],
    issue: string
  ) => Promise<{ decision: WatchdogDecision; reason: string }>;
}

export class HealthMonitor {
  private agents: Map<string, AgentHealthStatus> = new Map();
  private events: WatchdogEvents;
  private watchdogInvoker?: WatchdogInvoker;
  private checkInterval?: ReturnType<typeof setInterval>;

  constructor(events: WatchdogEvents, watchdogInvoker?: WatchdogInvoker) {
    this.events = events;
    this.watchdogInvoker = watchdogInvoker;
  }

  /**
   * Register an agent for health monitoring
   */
  registerAgent(agentId: string): void {
    this.agents.set(agentId, {
      agentId,
      isHealthy: true,
      lastOutputTime: new Date(),
      errorCount: 0,
      isStuck: false,
    });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  /**
   * Record agent output - resets timeout and checks for errors
   */
  recordOutput(agentId: string, line: string): void {
    const status = this.agents.get(agentId);
    if (!status) return;

    status.lastOutputTime = new Date();
    status.isStuck = false;

    // Check for error patterns
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(line)) {
        status.errorCount++;
        status.lastError = line;

        if (status.errorCount >= MAX_ERROR_COUNT) {
          status.isHealthy = false;
          this.events.onHealthIssue(agentId, `Repeated errors: ${line}`);
        }
        break;
      }
    }
  }

  /**
   * Record agent completion with exit code
   */
  recordExit(agentId: string, exitCode: number): void {
    const status = this.agents.get(agentId);
    if (!status) return;

    if (exitCode !== 0) {
      status.isHealthy = false;
      status.lastError = `Exit code: ${exitCode}`;
      this.events.onHealthIssue(agentId, `Non-zero exit code: ${exitCode}`);
    } else {
      // Successful completion - reset error count
      status.errorCount = 0;
      status.isHealthy = true;
    }
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(intervalMs: number = 30_000): void {
    this.stopPeriodicChecks();

    this.checkInterval = setInterval(() => {
      this.checkAllAgents();
    }, intervalMs);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  /**
   * Check all agents for timeout/stuck conditions
   */
  private checkAllAgents(): void {
    const now = Date.now();

    for (const [agentId, status] of this.agents) {
      const timeSinceOutput = now - status.lastOutputTime.getTime();

      if (timeSinceOutput > TIMEOUT_THRESHOLD_MS && !status.isStuck) {
        status.isStuck = true;
        status.isHealthy = false;
        this.events.onHealthIssue(agentId, `No output for ${Math.round(timeSinceOutput / 60000)} minutes`);
      }
    }
  }

  /**
   * Get health status for an agent
   */
  getStatus(agentId: string): AgentHealthStatus | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Check if an agent is healthy
   */
  isHealthy(agentId: string): boolean {
    return this.agents.get(agentId)?.isHealthy ?? true;
  }

  /**
   * Invoke watchdog for a specific agent
   */
  async invokeWatchdog(
    agentId: string,
    agentRole: AgentRole,
    recentOutput: string[],
    issue: string
  ): Promise<{ decision: WatchdogDecision; reason: string }> {
    if (!this.watchdogInvoker) {
      // Fallback: simple heuristic decision
      return this.makeHeuristicDecision(agentId, issue);
    }

    return this.watchdogInvoker.invokeWatchdog(agentId, agentRole, recentOutput, issue);
  }

  /**
   * Make a heuristic decision when watchdog is not available
   */
  private makeHeuristicDecision(
    agentId: string,
    issue: string
  ): { decision: WatchdogDecision; reason: string } {
    const status = this.agents.get(agentId);

    // If no output for too long, respawn
    if (status?.isStuck) {
      return {
        decision: 'respawn',
        reason: 'Agent appears stuck (no output for extended period)',
      };
    }

    // If too many errors, respawn
    if (status && status.errorCount >= MAX_ERROR_COUNT) {
      return {
        decision: 'respawn',
        reason: 'Too many consecutive errors',
      };
    }

    // If exit code was non-zero, respawn
    if (issue.includes('exit code') || issue.includes('Exit code')) {
      return {
        decision: 'respawn',
        reason: 'Non-zero exit code indicates failure',
      };
    }

    // Default: continue and monitor
    return {
      decision: 'continue',
      reason: 'Issue detected but not severe enough to require action',
    };
  }

  /**
   * Reset health status for an agent (e.g., after respawn)
   */
  resetStatus(agentId: string): void {
    const status = this.agents.get(agentId);
    if (status) {
      status.isHealthy = true;
      status.errorCount = 0;
      status.lastError = undefined;
      status.isStuck = false;
      status.lastOutputTime = new Date();
    }
  }

  /**
   * Get summary of all agents' health
   */
  getSummary(): Array<{ agentId: string; healthy: boolean; issue?: string }> {
    return Array.from(this.agents.values()).map(status => ({
      agentId: status.agentId,
      healthy: status.isHealthy,
      issue: status.isHealthy ? undefined : status.lastError || 'Unknown issue',
    }));
  }
}

/**
 * Create the watchdog prompt for Claude to analyze agent state
 */
export function createWatchdogPrompt(
  agentId: string,
  agentRole: AgentRole,
  recentOutput: string[],
  issue: string
): string {
  return `<task>Analyze agent health and decide on action.</task>

<agent>
<id>${agentId}</id>
<role>${agentRole}</role>
</agent>

<issue>${issue}</issue>

<recent_output>
${recentOutput.slice(-50).join('\n')}
</recent_output>

<instructions>
Analyze the agent's recent output and the reported issue.
Decide what action to take:
- respawn: Kill and restart the agent with same task
- inject_guidance: Send a helpful message to unstick the agent
- continue: No action needed, agent is making progress
- escalate_to_user: Issue requires human intervention
</instructions>

<output_format>
Respond with ONLY a JSON block:
\`\`\`json
{
  "decision": "respawn" | "inject_guidance" | "continue" | "escalate_to_user",
  "reason": "Brief explanation of your decision",
  "guidance": "If inject_guidance, the message to send"
}
\`\`\`
</output_format>`;
}

/**
 * Parse watchdog response from Claude
 */
export function parseWatchdogResponse(output: string): {
  decision: WatchdogDecision;
  reason: string;
  guidance?: string;
} | null {
  // Try to find JSON block
  const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch?.[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.decision) {
        const validDecisions: WatchdogDecision[] = ['respawn', 'inject_guidance', 'continue', 'escalate_to_user'];
        if (validDecisions.includes(parsed.decision)) {
          return {
            decision: parsed.decision,
            reason: parsed.reason || 'No reason provided',
            guidance: parsed.guidance,
          };
        }
      }
    } catch {
      // Failed to parse
    }
  }

  // Fallback: look for keywords
  const lowerOutput = output.toLowerCase();
  if (lowerOutput.includes('respawn')) {
    return { decision: 'respawn', reason: 'Watchdog indicated respawn needed' };
  }
  if (lowerOutput.includes('escalate')) {
    return { decision: 'escalate_to_user', reason: 'Watchdog indicated human intervention needed' };
  }

  return null;
}
