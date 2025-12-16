/**
 * Task List View
 *
 * Shows all tasks across agents with their status.
 */

import blessed from 'blessed';
import type { Task, AgentState } from '../../types.ts';

/** Status symbols and colors */
const STATUS_DISPLAY: Record<Task['status'], { symbol: string; color: string }> = {
  pending: { symbol: '○', color: 'gray' },
  running: { symbol: '◐', color: 'yellow' },
  complete: { symbol: '●', color: 'green' },
  failed: { symbol: '✗', color: 'red' },
};

export class TasksView {
  private screen: blessed.Widgets.Screen;
  private container: blessed.Widgets.BoxElement;
  private list: blessed.Widgets.ListElement;
  private tasks: Task[] = [];
  private agentMap: Map<string, string> = new Map(); // agentId -> name

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
          fg: 'cyan',
        },
      },
      label: ' Tasks [ESC to close] ',
      hidden: true,
    });

    this.list = blessed.list({
      parent: this.container,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-2',
      style: {
        selected: {
          bg: 'blue',
        },
      },
      keys: true,
      mouse: true,
      tags: true,
    });
  }

  /**
   * Update the task list
   */
  update(tasks: Task[], agents?: AgentState[]): void {
    this.tasks = tasks;
    // Build agent name map if agents provided
    if (agents) {
      this.agentMap.clear();
      for (const agent of agents) {
        this.agentMap.set(agent.config.id, agent.config.name);
      }
    }
    this.renderList();
  }

  private renderList(): void {
    const items = this.tasks.map(task => {
      const display = STATUS_DISPLAY[task.status];
      let agentInfo = '';
      if (task.agentId) {
        const agentName = this.agentMap.get(task.agentId);
        agentInfo = agentName ? ` {cyan-fg}[${agentName}]{/cyan-fg}` : ` {gray-fg}[${task.agentId.split('-')[0]}]{/gray-fg}`;
      }
      return `{${display.color}-fg}${display.symbol}{/${display.color}-fg} ${task.description}${agentInfo}`;
    });

    this.list.setItems(items);

    // Update title with progress
    const completedCount = this.tasks.filter(t => t.status === 'complete').length;
    const totalCount = this.tasks.length;
    this.container.setLabel(` Tasks ${completedCount}/${totalCount} [ESC to close] `);

    if (this.tasks.length === 0) {
      this.list.setItems(['{gray-fg}No tasks yet{/gray-fg}']);
    }

    this.screen.render();
  }

  /**
   * Show the view
   */
  show(): void {
    this.container.show();
    this.list.focus();
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
