/**
 * Autonoma Desktop - Main Entry Point
 *
 * This is the Electrobun main process that creates the application window
 * and manages the connection to the Python backend.
 */

import { app, BrowserWindow, ipcMain, Menu, Tray } from "electrobun";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pythonProcess: ChildProcess | null = null;

// Backend connection state
interface BackendState {
  connected: boolean;
  port: number;
  logs: string[];
}

const backendState: BackendState = {
  connected: false,
  port: 8765,
  logs: [],
};

/**
 * Start the Python backend process
 */
async function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Spawn Python process with WebSocket server
    pythonProcess = spawn("python", ["-m", "autonoma.desktop.server"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AUTONOMA_DESKTOP_PORT: String(backendState.port),
      },
    });

    pythonProcess.stdout?.on("data", (data: Buffer) => {
      const message = data.toString();
      backendState.logs.push(message);

      // Check for ready signal
      if (message.includes("Server started")) {
        backendState.connected = true;
        resolve();
      }

      // Forward to renderer
      mainWindow?.webContents.send("backend-log", message);
    });

    pythonProcess.stderr?.on("data", (data: Buffer) => {
      const message = data.toString();
      backendState.logs.push(`[ERROR] ${message}`);
      mainWindow?.webContents.send("backend-error", message);
    });

    pythonProcess.on("close", (code: number) => {
      backendState.connected = false;
      mainWindow?.webContents.send("backend-closed", code);
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!backendState.connected) {
        reject(new Error("Backend startup timeout"));
      }
    }, 10000);
  });
}

/**
 * Stop the Python backend process
 */
function stopBackend(): void {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
    backendState.connected = false;
  }
}

/**
 * Create the main application window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Autonoma",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Load the renderer
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../public/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Create system tray icon
 */
function createTray(): void {
  tray = new Tray(path.join(__dirname, "../public/tray-icon.png"));

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show Autonoma", click: () => mainWindow?.show() },
    { type: "separator" },
    { label: "Start Execution", click: () => mainWindow?.webContents.send("menu-start") },
    { label: "Pause", click: () => mainWindow?.webContents.send("menu-pause") },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);

  tray.setToolTip("Autonoma");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    mainWindow?.show();
  });
}

/**
 * Set up IPC handlers for renderer communication
 */
function setupIPC(): void {
  // Get backend state
  ipcMain.handle("get-backend-state", () => backendState);

  // Start orchestration
  ipcMain.handle("start-orchestration", async (_event, requirementsPath: string) => {
    mainWindow?.webContents.send("orchestration-starting");
    // Send command to Python backend via WebSocket
    // Implementation depends on WebSocket client setup
    return { success: true };
  });

  // Pause orchestration
  ipcMain.handle("pause-orchestration", async () => {
    return { success: true };
  });

  // Resume orchestration
  ipcMain.handle("resume-orchestration", async () => {
    return { success: true };
  });

  // Get logs
  ipcMain.handle("get-logs", () => backendState.logs);

  // Open file dialog
  ipcMain.handle("open-file-dialog", async () => {
    const { dialog } = await import("electrobun");
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openFile"],
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "Text", extensions: ["txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    return result;
  });
}

/**
 * Application lifecycle handlers
 */
app.whenReady().then(async () => {
  try {
    await startBackend();
    createWindow();
    createTray();
    setupIPC();
  } catch (error) {
    console.error("Failed to start:", error);
    // Show error window or notification
    createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopBackend();
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("before-quit", () => {
  stopBackend();
});
