/**
 * Tile Layout Manager
 *
 * Manages the split-tile layout for displaying agent outputs.
 */

import blessed from 'blessed';
import type { AgentRole, AgentState, AgentStatus } from '../types.ts';

interface TileConfig {
  agentId: string;
  role: AgentRole;
  name: string;
}

interface TileInstance {
  config: TileConfig;
  box: blessed.Widgets.BoxElement;
  log: blessed.Widgets.Log;
  isSelected: boolean;
}

/** Status colors */
const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: 'gray',
  running: 'green',
  complete: 'blue',
  error: 'red',
};

/** Role colors for borders */
const ROLE_COLORS: Record<AgentRole, string> = {
  ceo: 'yellow',
  staff: 'cyan',
  developer: 'green',
  qa: 'magenta',
  e2e: 'blue',
};

export class TileManager {
  private screen: blessed.Widgets.Screen;
  private tiles: Map<string, TileInstance> = new Map();
  private tileOrder: string[] = [];
  private selectedIndex = 0;
  private container: blessed.Widgets.BoxElement;
  private focusedTile: string | null = null;

  constructor(screen: blessed.Widgets.Screen) {
    this.screen = screen;

    // Create container for all tiles
    this.container = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-1', // Leave room for status bar
    });
  }

  /**
   * Create tiles for the given agents
   */
  createTiles(agents: AgentState[]): void {
    // Clear existing tiles
    this.clearTiles();

    // Sort agents by role for consistent layout
    const sortedAgents = [...agents].sort((a, b) => {
      const roleOrder: AgentRole[] = ['ceo', 'staff', 'developer', 'qa'];
      return roleOrder.indexOf(a.config.role) - roleOrder.indexOf(b.config.role);
    });

    // Calculate layout
    const layout = this.calculateLayout(sortedAgents);

    // Create tiles
    for (let i = 0; i < sortedAgents.length; i++) {
      const agent = sortedAgents[i];
      if (!agent) continue;

      const pos = layout[i];
      if (!pos) continue;

      const tile = this.createTile(agent, pos);
      this.tiles.set(agent.config.id, tile);
      this.tileOrder.push(agent.config.id);
    }

    // Select first tile
    if (this.tileOrder.length > 0) {
      this.selectTile(0);
    }
  }

  private calculateLayout(agents: AgentState[]): Array<{
    left: string;
    top: string;
    width: string;
    height: string;
  }> {
    const layout: Array<{
      left: string;
      top: string;
      width: string;
      height: string;
    }> = [];

    // Count agents by role
    const ceoCount = agents.filter(a => a.config.role === 'ceo').length;
    const staffCount = agents.filter(a => a.config.role === 'staff').length;
    const devCount = agents.filter(a => a.config.role === 'developer').length;
    const qaCount = agents.filter(a => a.config.role === 'qa').length;

    // Layout: CEO (40%) | Staff (30%) | Dev+QA (30%)
    // If multiple devs/QA, stack them vertically in their column

    let currentLeft = 0;

    // CEO tiles
    for (let i = 0; i < ceoCount; i++) {
      layout.push({
        left: `${currentLeft}%`,
        top: `${(i * 100) / ceoCount}%`,
        width: '40%',
        height: `${100 / ceoCount}%`,
      });
    }
    currentLeft += 40;

    // Staff tiles
    for (let i = 0; i < staffCount; i++) {
      layout.push({
        left: `${currentLeft}%`,
        top: `${(i * 100) / staffCount}%`,
        width: '30%',
        height: `${100 / staffCount}%`,
      });
    }
    currentLeft += 30;

    // Dev and QA tiles (stacked in remaining 30%)
    const rightColumnAgents = devCount + qaCount;
    let rightIndex = 0;

    for (let i = 0; i < devCount; i++) {
      layout.push({
        left: `${currentLeft}%`,
        top: `${(rightIndex * 100) / rightColumnAgents}%`,
        width: '30%',
        height: `${100 / rightColumnAgents}%`,
      });
      rightIndex++;
    }

    for (let i = 0; i < qaCount; i++) {
      layout.push({
        left: `${currentLeft}%`,
        top: `${(rightIndex * 100) / rightColumnAgents}%`,
        width: '30%',
        height: `${100 / rightColumnAgents}%`,
      });
      rightIndex++;
    }

    return layout;
  }

  private createTile(
    agent: AgentState,
    position: { left: string; top: string; width: string; height: string }
  ): TileInstance {
    const roleColor = ROLE_COLORS[agent.config.role];

    const box = blessed.box({
      parent: this.container,
      left: position.left,
      top: position.top,
      width: position.width,
      height: position.height,
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: roleColor,
        },
      },
      label: ` ${agent.config.name} [${agent.config.role.toUpperCase()}] `,
    });

    const log = blessed.log({
      parent: box,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-2',
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '│',
        style: {
          fg: 'gray',
        },
      },
      mouse: true,
      keys: true,
      tags: true,
      // Limit scrollback to prevent memory leak in indefinite mode
      scrollback: 1000,
    });

    // Add existing output
    for (const line of agent.output) {
      log.log(line);
    }

    return {
      config: {
        agentId: agent.config.id,
        role: agent.config.role,
        name: agent.config.name,
      },
      box,
      log,
      isSelected: false,
    };
  }

  /**
   * Add output to a tile
   */
  addOutput(agentId: string, line: string): void {
    const tile = this.tiles.get(agentId);
    if (tile) {
      tile.log.log(line);
      this.screen.render();
    }
  }

  /**
   * Update tile status (changes border color)
   */
  updateStatus(agentId: string, status: AgentStatus): void {
    const tile = this.tiles.get(agentId);
    if (tile) {
      const color = tile.isSelected ? 'white' : STATUS_COLORS[status];
      tile.box.style.border = { fg: color };
      this.screen.render();
    }
  }

  /**
   * Navigate to adjacent tile
   */
  navigate(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (this.tileOrder.length === 0) return;

    // Simple navigation: just move through the list
    let newIndex = this.selectedIndex;

    switch (direction) {
      case 'up':
      case 'left':
        newIndex = (this.selectedIndex - 1 + this.tileOrder.length) % this.tileOrder.length;
        break;
      case 'down':
      case 'right':
        newIndex = (this.selectedIndex + 1) % this.tileOrder.length;
        break;
    }

    this.selectTile(newIndex);
  }

  private selectTile(index: number): void {
    // Deselect previous
    const prevId = this.tileOrder[this.selectedIndex];
    if (prevId) {
      const prevTile = this.tiles.get(prevId);
      if (prevTile) {
        prevTile.isSelected = false;
        prevTile.box.style.border = { fg: ROLE_COLORS[prevTile.config.role] };
      }
    }

    // Select new
    this.selectedIndex = index;
    const newId = this.tileOrder[index];
    if (newId) {
      const newTile = this.tiles.get(newId);
      if (newTile) {
        newTile.isSelected = true;
        newTile.box.style.border = { fg: 'white' };
      }
    }

    this.screen.render();
  }

  /**
   * Get currently selected agent ID
   */
  getSelectedAgentId(): string | undefined {
    return this.tileOrder[this.selectedIndex];
  }

  /**
   * Focus (maximize) the selected tile
   */
  focus(): void {
    const agentId = this.getSelectedAgentId();
    if (!agentId) return;

    this.focusedTile = agentId;

    // Hide all tiles except focused
    for (const [id, tile] of this.tiles) {
      if (id === agentId) {
        tile.box.left = 0;
        tile.box.top = 0;
        tile.box.width = '100%';
        tile.box.height = '100%';
        tile.box.show();
      } else {
        tile.box.hide();
      }
    }

    this.screen.render();
  }

  /**
   * Unfocus (return to split view)
   */
  unfocus(): void {
    if (!this.focusedTile) return;

    // Get agents to recalculate layout
    const agents: AgentState[] = [];
    for (const [id, tile] of this.tiles) {
      agents.push({
        config: {
          id,
          role: tile.config.role,
          name: tile.config.name,
          workingDir: '',
          permissionMode: tile.config.role === 'ceo' || tile.config.role === 'staff' ? 'plan' : 'full',
        },
        status: 'idle',
        output: [],
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
      });
    }

    // Recalculate layout
    const layout = this.calculateLayout(agents);

    // Restore positions
    let i = 0;
    for (const [, tile] of this.tiles) {
      const pos = layout[i];
      if (pos) {
        tile.box.left = pos.left;
        tile.box.top = pos.top;
        tile.box.width = pos.width;
        tile.box.height = pos.height;
        tile.box.show();
      }
      i++;
    }

    this.focusedTile = null;
    this.screen.render();
  }

  /**
   * Show/hide all tiles
   */
  show(): void {
    this.container.show();
    this.screen.render();
  }

  hide(): void {
    this.container.hide();
    this.screen.render();
  }

  /**
   * Clear all tiles
   */
  private clearTiles(): void {
    for (const [, tile] of this.tiles) {
      tile.box.destroy();
    }
    this.tiles.clear();
    this.tileOrder = [];
    this.selectedIndex = 0;
    this.focusedTile = null;
  }

  /**
   * Destroy the tile manager
   */
  destroy(): void {
    this.clearTiles();
    this.container.destroy();
  }
}
