/**
 * Preload script for secure IPC communication
 */

import { contextBridge, ipcRenderer } from "electrobun";

// Expose safe APIs to renderer
contextBridge.exposeInMainWorld("autonoma", {
  // Backend state
  getBackendState: () => ipcRenderer.invoke("get-backend-state"),

  // Orchestration controls
  startOrchestration: (requirementsPath: string) =>
    ipcRenderer.invoke("start-orchestration", requirementsPath),
  pauseOrchestration: () => ipcRenderer.invoke("pause-orchestration"),
  resumeOrchestration: () => ipcRenderer.invoke("resume-orchestration"),

  // Logs
  getLogs: () => ipcRenderer.invoke("get-logs"),

  // File dialog
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),

  // Event listeners
  onBackendLog: (callback: (message: string) => void) => {
    ipcRenderer.on("backend-log", (_event, message) => callback(message));
  },
  onBackendError: (callback: (message: string) => void) => {
    ipcRenderer.on("backend-error", (_event, message) => callback(message));
  },
  onBackendClosed: (callback: (code: number) => void) => {
    ipcRenderer.on("backend-closed", (_event, code) => callback(code));
  },
  onOrchestrationEvent: (callback: (event: string, data: unknown) => void) => {
    ipcRenderer.on("orchestration-event", (_event, eventName, data) =>
      callback(eventName, data)
    );
  },
  onMenuStart: (callback: () => void) => {
    ipcRenderer.on("menu-start", () => callback());
  },
  onMenuPause: (callback: () => void) => {
    ipcRenderer.on("menu-pause", () => callback());
  },
});
