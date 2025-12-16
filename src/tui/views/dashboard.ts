/**
 * Dashboard View
 *
 * Overview of the agent hierarchy and quick status.
 */

import blessed from 'blessed';
import type { AgentState } from '../../types.ts';

export class DashboardView {
  private screen: blessed.Widgets.Screen;
  private container: blessed.Widgets.BoxElement;
  private content: blessed.Widgets.BoxElement;

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
          fg: 'magenta',
        },
      },
      label: ' Dashboard [ESC to close] ',
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
   * Update dashboard display
   */
  update(agents: AgentState[]): void {
    const lines: string[] = [];

    // Header
    lines.push('{bold}{center}AUTONOMA{/center}{/bold}');
    lines.push('{center}Claude Code Orchestrator{/center}');
    lines.push('');

    // Calculate totals
    const totalTokens = agents.reduce((sum, a) => sum + a.tokenUsage.inputTokens + a.tokenUsage.outputTokens, 0);
    const totalCost = agents.reduce((sum, a) => sum + a.tokenUsage.totalCostUsd, 0);
    if (totalTokens > 0) {
      lines.push(`{center}Total: ${totalTokens.toLocaleString()} tokens | $${totalCost.toFixed(4)}{/center}`);
    }
    lines.push('');

    // Agent table
    lines.push('{bold}Agents:{/bold}');
    lines.push('');
    lines.push('  Status  Name                 Tokens         Cost');
    lines.push('  ──────  ────────────────     ──────────     ──────');

    // CEO
    const ceo = agents.find(a => a.config.role === 'ceo');
    if (ceo) {
      const tokens = ceo.tokenUsage.inputTokens + ceo.tokenUsage.outputTokens;
      lines.push(`  ${this.getStatusIndicator(ceo.status)}     CEO                  ${this.padLeft(tokens.toLocaleString(), 10)}     $${ceo.tokenUsage.totalCostUsd.toFixed(4)}`);
    }

    // Staff Engineer
    const staff = agents.find(a => a.config.role === 'staff');
    if (staff) {
      const tokens = staff.tokenUsage.inputTokens + staff.tokenUsage.outputTokens;
      lines.push(`  ${this.getStatusIndicator(staff.status)}     Staff Engineer       ${this.padLeft(tokens.toLocaleString(), 10)}     $${staff.tokenUsage.totalCostUsd.toFixed(4)}`);
    }

    // All Developers
    const devs = agents.filter(a => a.config.role === 'developer');
    for (const dev of devs) {
      const tokens = dev.tokenUsage.inputTokens + dev.tokenUsage.outputTokens;
      const name = dev.config.name.padEnd(16);
      lines.push(`  ${this.getStatusIndicator(dev.status)}     ${name}     ${this.padLeft(tokens.toLocaleString(), 10)}     $${dev.tokenUsage.totalCostUsd.toFixed(4)}`);
    }

    // QA
    const qa = agents.find(a => a.config.role === 'qa');
    if (qa) {
      const tokens = qa.tokenUsage.inputTokens + qa.tokenUsage.outputTokens;
      lines.push(`  ${this.getStatusIndicator(qa.status)}     QA                   ${this.padLeft(tokens.toLocaleString(), 10)}     $${qa.tokenUsage.totalCostUsd.toFixed(4)}`);
    }

    lines.push('');
    lines.push('');

    // Status legend
    lines.push('{bold}Status Legend:{/bold}');
    lines.push('');
    lines.push('  {gray-fg}○{/gray-fg} Idle    {yellow-fg}◐{/yellow-fg} Running    {green-fg}●{/green-fg} Complete    {red-fg}✗{/red-fg} Error');
    lines.push('');

    // Keyboard shortcuts
    lines.push('{bold}Keyboard Shortcuts:{/bold}');
    lines.push('');
    lines.push('  ↑↓←→  Navigate tiles     t  Task list');
    lines.push('  Enter Focus tile         s  Stats');
    lines.push('  ESC   Return/Close       d  Dashboard');
    lines.push('  q     Quit');

    this.content.setContent(lines.join('\n'));
    this.screen.render();
  }

  private padLeft(str: string, len: number): string {
    return str.padStart(len);
  }

  private getStatusIndicator(status: AgentState['status']): string {
    switch (status) {
      case 'idle':
        return '{gray-fg}○{/gray-fg}';
      case 'running':
        return '{yellow-fg}◐{/yellow-fg}';
      case 'complete':
        return '{green-fg}●{/green-fg}';
      case 'error':
        return '{red-fg}✗{/red-fg}';
    }
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
