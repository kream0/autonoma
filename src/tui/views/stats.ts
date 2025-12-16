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
   * Update stats display
   */
  update(agents: AgentState[], tasks: Task[]): void {
    const lines: string[] = [];

    // Duration
    if (this.startTime) {
      const duration = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      lines.push(`{bold}Session Duration:{/bold} ${minutes}m ${seconds}s`);
      lines.push('');
    }

    // Token totals
    const totalTokens = agents.reduce((sum, a) => sum + a.tokenUsage.inputTokens + a.tokenUsage.outputTokens, 0);
    const totalCost = agents.reduce((sum, a) => sum + a.tokenUsage.totalCostUsd, 0);
    if (totalTokens > 0) {
      lines.push(`{bold}Tokens:{/bold} ${totalTokens.toLocaleString()} total | {bold}Cost:{/bold} $${totalCost.toFixed(4)}`);
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
        lines.push(`    Cost: $${agent.tokenUsage.totalCostUsd.toFixed(4)}`);
      }
      lines.push('');
    }

    // Task stats
    const taskStats = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      complete: tasks.filter(t => t.status === 'complete').length,
      failed: tasks.filter(t => t.status === 'failed').length,
    };

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
