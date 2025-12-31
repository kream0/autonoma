/**
 * Notifications View
 *
 * Displays pending human queue messages in TUI.
 */

import blessed from 'blessed';
import type { HumanQueueMessage } from '../../human-queue/types.ts';

export class NotificationsView {
  private container: blessed.Widgets.BoxElement;
  private list: blessed.Widgets.ListElement;
  private messages: HumanQueueMessage[] = [];
  private onRespond?: (id: string, response: string) => void;
  public visible = false;

  constructor(
    screen: blessed.Widgets.Screen,
    onRespond?: (id: string, response: string) => void
  ) {
    this.onRespond = onRespond;

    this.container = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-1',
      hidden: true,
      border: { type: 'line' },
      label: ' Pending Messages [n] [ESC to close] ',
      style: { border: { fg: 'yellow' } },
    });

    this.list = blessed.list({
      parent: this.container,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-2',
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      style: {
        selected: { bg: 'blue' },
        item: { fg: 'white' },
      },
    });

    // Handle selection for responding
    this.list.on('select', (_item, index) => {
      const message = this.messages[index];
      if (message && this.onRespond) {
        // In a real implementation, we'd show an input dialog
        // For now, just log the selection
        this.onRespond(message.id, 'User acknowledged');
      }
    });
  }

  update(messages: HumanQueueMessage[]): void {
    this.messages = messages;

    if (messages.length === 0) {
      this.list.setItems(['{gray-fg}No pending messages{/gray-fg}']);
      this.container.setLabel(' Pending Messages (0) [n] [ESC to close] ');
      return;
    }

    const items = messages.map((m) => {
      const icon =
        m.type === 'blocker'
          ? '{red-fg}[!]{/red-fg}'
          : m.type === 'question'
            ? '{yellow-fg}[?]{/yellow-fg}'
            : '{cyan-fg}[A]{/cyan-fg}';
      const block = m.blocking ? ' {red-fg}(BLOCKING){/red-fg}' : '';
      const pri = `{gray-fg}[${m.priority}]{/gray-fg}`;
      const taskInfo = m.taskId ? ` Task: ${m.taskId}` : '';
      return `${icon} ${pri} {bold}${m.id}{/bold}:${taskInfo} ${m.content.slice(0, 50)}...${block}`;
    });

    this.list.setItems(items);
    this.container.setLabel(
      ` Pending Messages (${messages.length}) [n] [ESC to close] `
    );
  }

  show(): void {
    this.container.show();
    this.list.focus();
    this.visible = true;
  }

  hide(): void {
    this.container.hide();
    this.visible = false;
  }

  getMessageCount(): number {
    return this.messages.length;
  }
}
