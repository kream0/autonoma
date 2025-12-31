/**
 * Core types for Autonoma - Re-exports from modular type files
 */

// Agent types
export type {
  AgentRole,
  AgentStatus,
  PermissionMode,
  AgentConfig,
  TokenUsage,
  AgentState,
  ContextThreshold,
  WatchdogDecision,
  AgentContextState,
  AgentHealthStatus,
} from './agent.ts';

// Task types
export type {
  TaskComplexity,
  DevTask,
  TaskBatch,
  Task,
} from './task.ts';

// State types
export type {
  OrchestrationPhase,
  ParsedHandoff,
  AgentHandoff,
  UserInterrupt,
  PersistedState,
  StatusFile,
} from './state.ts';

// Protocol types (daemon & worker)
export type {
  FileModification,
  Learning,
  MemoryCategory,
  DaemonHeartbeat,
  DaemonStatus,
  DaemonCheckpoint,
  DaemonComplete,
  DaemonBlocked,
  DaemonError,
  DaemonMessage,
  TaskBundle,
  WorkerResult,
} from './protocol.ts';

// Memory types
export type {
  Memory,
  MemoryQuery,
  MemorySearchResult,
  IMemoryStore,
} from './memory.ts';

// TUI types (kept inline for simplicity)
/** Tile in the TUI */
export interface Tile {
  id: string;
  agentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** View modes */
export type ViewMode = 'tiles' | 'focus' | 'tasks' | 'stats' | 'dashboard';

/** Session stats */
export interface SessionStats {
  startTime: Date;
  agents: {
    id: string;
    role: import('./agent.ts').AgentRole;
    status: import('./agent.ts').AgentStatus;
    messageCount: number;
  }[];
  tasks: {
    total: number;
    pending: number;
    running: number;
    complete: number;
    failed: number;
  };
}

/** Tile layout for different agent combinations */
export interface TileLayout {
  tiles: {
    agentId: string;
    role: import('./agent.ts').AgentRole;
    x: string;
    y: string;
    width: string;
    height: string;
  }[];
}
