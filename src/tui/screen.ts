/**
 * Main TUI Screen
 *
 * Creates and manages the blessed screen and handles global key bindings.
 */

import blessed from 'blessed';
import type { ViewMode } from '../types.ts';

export interface ScreenEvents {
  onQuit: () => void;
  onViewChange: (mode: ViewMode) => void;
  onNavigate: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onFocus: () => void;
  onUnfocus: () => void;
  onPause?: () => void;  // For indefinite mode
}

export class Screen {
  public screen: blessed.Widgets.Screen;
  private events: ScreenEvents;
  private currentView: ViewMode = 'tiles';
  private isFocused = false;

  constructor(events: ScreenEvents) {
    this.events = events;

    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Autonoma - Claude Code Orchestrator',
      fullUnicode: true,
    });

    this.setupKeyBindings();
  }

  private setupKeyBindings(): void {
    // Quit
    this.screen.key(['q', 'C-c'], () => {
      this.events.onQuit();
    });

    // Navigation (arrow keys)
    this.screen.key(['up', 'k'], () => {
      if (!this.isFocused) {
        this.events.onNavigate('up');
      }
    });

    this.screen.key(['down', 'j'], () => {
      if (!this.isFocused) {
        this.events.onNavigate('down');
      }
    });

    this.screen.key(['left', 'h'], () => {
      if (!this.isFocused) {
        this.events.onNavigate('left');
      }
    });

    this.screen.key(['right', 'l'], () => {
      if (!this.isFocused) {
        this.events.onNavigate('right');
      }
    });

    // Focus mode (Enter to focus, Escape to unfocus)
    this.screen.key(['enter', 'return'], () => {
      if (!this.isFocused && this.currentView === 'tiles') {
        this.isFocused = true;
        this.events.onFocus();
      }
    });

    this.screen.key(['escape'], () => {
      if (this.isFocused) {
        this.isFocused = false;
        this.events.onUnfocus();
      } else if (this.currentView !== 'tiles') {
        this.setView('tiles');
      }
    });

    // View shortcuts
    this.screen.key(['t'], () => {
      if (!this.isFocused) {
        this.setView('tasks');
      }
    });

    this.screen.key(['s'], () => {
      if (!this.isFocused) {
        this.setView('stats');
      }
    });

    this.screen.key(['d'], () => {
      if (!this.isFocused) {
        this.setView('dashboard');
      }
    });

    // Pause (for indefinite mode)
    this.screen.key(['p'], () => {
      if (!this.isFocused && this.events.onPause) {
        this.events.onPause();
      }
    });
  }

  private setView(mode: ViewMode): void {
    if (this.currentView !== mode) {
      this.currentView = mode;
      this.events.onViewChange(mode);
    }
  }

  get view(): ViewMode {
    return this.currentView;
  }

  get focused(): boolean {
    return this.isFocused;
  }

  render(): void {
    this.screen.render();
  }

  destroy(): void {
    this.screen.destroy();
  }
}
