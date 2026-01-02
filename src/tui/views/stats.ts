/**
 * Stats View
 *
 * Shows session statistics and agent performance.
 */

import blessed from 'blessed';
import type { AgentState, Task } from '../../types.ts';

export class StatsView {
  private screen: blessed.Widgets.Screen;
  private container: blessed.Widgets.BoxElement;
  private content: blessed.Widgets.BoxElement;
  private startTime: Date | null = null;
  private taskCompletionTimes: Date[] = [];
  private lastCompletedCount = 0;

  constructor(screen: blessed.Widgets.Screen) {
    this.screen = screen;

    this.container = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-1',
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: 'green',
        },
      },
      label: ' Stats [ESC to close] ',
      hidden: true,
    });

    this.content = blessed.box({
      parent: this.container,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-2',
      tags: true,
      content: '',
    });
  }

  /**
   * Set session start time
   */
  setStartTime(time: Date): void {
    this.startTime = time;
  }

  /**
   * Calculate completion rate (tasks per minute) over last N completions
   * Uses sliding window of recent completions for accuracy
   */
  private calculateCompletionRate(): number {
    const windowSize = 5; // Use last 5 completions
    if (this.taskCompletionTimes.length < 2) return 0;

    const times = this.taskCompletionTimes.slice(-windowSize);
    if (times.length < 2) return 0;

    const firstTime = times[0]!.getTime();
    const lastTime = times[times.length - 1]!.getTime();
    const durationMinutes = (lastTime - firstTime) / 60000;

    if (durationMinutes <= 0) return 0;
    return (times.length - 1) / durationMinutes;
  }

  /**
   * Format duration as human-readable string
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }

  /**
   * Update stats display
   * @param contextUsage Optional map of agentId -> context percentage (0-100)
   */
  update(agents: AgentState[], tasks: Task[], contextUsage?: Map<string, number>): void {
    const lines: string[] = [];

    // Task stats (moved up for ETA calculation)
    const taskStats = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      complete: tasks.filter(t => t.status === 'complete').length,
      failed: tasks.filter(t => t.status === 'failed').length,
    };

    // Track new task completions for rate calculation
    if (taskStats.complete > this.lastCompletedCount) {
      const newCompletions = taskStats.complete - this.lastCompletedCount;
      for (let i = 0; i < newCompletions; i++) {
        this.taskCompletionTimes.push(new Date());
      }
      // Keep only last 20 completions to bound memory
      if (this.taskCompletionTimes.length > 20) {
        this.taskCompletionTimes = this.taskCompletionTimes.slice(-20);
      }
      this.lastCompletedCount = taskStats.complete;
    }

    // Duration and ETA
    if (this.startTime) {
      const duration = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
      lines.push(`{bold}Session Duration:{/bold} ${this.formatDuration(duration)}`);

      // Calculate and show ETA if we have completion data
      const rate = this.calculateCompletionRate();
      const remaining = taskStats.pending + taskStats.running;
      if (rate > 0 && remaining > 0) {
        const etaMinutes = remaining / rate;
        const etaSeconds = etaMinutes * 60;
        lines.push(`{bold}Est. Remaining:{/bold} ${this.formatDuration(etaSeconds)} ({cyan-fg}${rate.toFixed(1)} tasks/min{/cyan-fg})`);
      } else if (remaining > 0 && taskStats.complete === 0) {
        lines.push(`{bold}Est. Remaining:{/bold} {gray-fg}calculating...{/gray-fg}`);
      } else if (remaining === 0 && taskStats.complete > 0) {
        lines.push(`{bold}Status:{/bold} {green-fg}All tasks complete{/green-fg}`);
      }
      lines.push('');
    }

    // Token totals
    const totalTokens = agents.reduce((sum, a) => sum + a.tokenUsage.inputTokens + a.tokenUsage.outputTokens, 0);
    if (totalTokens > 0) {
      lines.push(`{bold}Tokens:{/bold} ${totalTokens.toLocaleString()} total`);
      lines.push('');
    }

    // Agent stats
    lines.push('{bold}Agents:{/bold}');
    lines.push('');
    for (const agent of agents) {
      const statusColor = agent.status === 'running' ? 'green' :
                          agent.status === 'complete' ? 'blue' :
                          agent.status === 'error' ? 'red' : 'gray';
      const tokens = agent.tokenUsage.inputTokens + agent.tokenUsage.outputTokens;
      lines.push(`  {${statusColor}-fg}●{/${statusColor}-fg} ${agent.config.name} (${agent.config.role})`);
      lines.push(`    Status: ${agent.status}`);
      lines.push(`    Messages: ${agent.output.length}`);
      if (tokens > 0) {
        lines.push(`    Tokens: ${tokens.toLocaleString()} (in: ${agent.tokenUsage.inputTokens.toLocaleString()}, out: ${agent.tokenUsage.outputTokens.toLocaleString()})`);
      }
      // Show context usage if available
      if (contextUsage) {
        const percent = contextUsage.get(agent.config.id) ?? 0;
        if (percent > 0) {
          const contextColor = percent >= 80 ? 'red' : percent >= 60 ? 'yellow' : 'green';
          lines.push(`    {${contextColor}-fg}Context: ${percent}%{/${contextColor}-fg}`);
        }
      }
      lines.push('');
    }

    lines.push('{bold}Tasks:{/bold}');
    lines.push('');
    lines.push(`  Total: ${taskStats.total}`);
    lines.push(`  {gray-fg}○{/gray-fg} Pending: ${taskStats.pending}`);
    lines.push(`  {yellow-fg}◐{/yellow-fg} Running: ${taskStats.running}`);
    lines.push(`  {green-fg}●{/green-fg} Complete: ${taskStats.complete}`);
    lines.push(`  {red-fg}✗{/red-fg} Failed: ${taskStats.failed}`);

    this.content.setContent(lines.join('\n'));
    this.screen.render();
  }

  /**
   * Show the view
   */
  show(): void {
    this.container.show();
    this.screen.render();
  }

  /**
   * Hide the view
   */
  hide(): void {
    this.container.hide();
    this.screen.render();
  }

  /**
   * Check if visible
   */
  get visible(): boolean {
    return this.container.visible;
  }

  /**
   * Destroy the view
   */
  destroy(): void {
    this.container.destroy();
  }
}
