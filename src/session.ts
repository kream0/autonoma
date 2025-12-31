/**
 * Claude Code Session Wrapper
 *
 * Manages a single Claude Code CLI subprocess and streams its output.
 * Uses --output-format stream-json for real-time JSONL streaming.
 */

import type { Subprocess } from 'bun';
import type { AgentConfig, AgentStatus, TokenUsage } from './types.ts';

export interface SessionEvents {
  onOutput: (line: string) => void;
  onStatusChange: (status: AgentStatus) => void;
  onError: (error: string) => void;
  onTokenUpdate?: (usage: TokenUsage) => void;
}

/** Types for stream-json output format */
interface StreamMessage {
  type: 'system' | 'user' | 'assistant';
  subtype?: 'init' | 'result';
  message?: {
    role: string;
    content: Array<{
      type: string;
      text?: string;
      tool_use?: { name: string; input: unknown };
      tool_result?: { content: string };
    }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  result?: string;
  is_error?: boolean;
  duration_ms?: number;
  total_cost_usd?: number;
  session?: {
    input_tokens?: number;
    output_tokens?: number;
    total_cost?: number;
  };
}

export class ClaudeSession {
  private process: Subprocess | null = null;
  private _status: AgentStatus = 'idle';
  private _output: string[] = [];
  private _tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 };
  private events: SessionEvents;
  private config: AgentConfig;
  private decoder = new TextDecoder();

  constructor(config: AgentConfig, events: SessionEvents) {
    this.config = config;
    this.events = events;
  }

  get status(): AgentStatus {
    return this._status;
  }

  get output(): string[] {
    return this._output;
  }

  get tokenUsage(): TokenUsage {
    return this._tokenUsage;
  }

  private setStatus(status: AgentStatus) {
    this._status = status;
    this.events.onStatusChange(status);
  }

  private addOutput(line: string) {
    this._output.push(line);
    this.events.onOutput(line);
  }

  /**
   * Start a Claude Code session with the given prompt
   * Uses stdin streaming for large prompts to avoid E2BIG errors
   */
  async start(prompt: string): Promise<void> {
    if (this.process) {
      throw new Error('Session already running');
    }

    this.setStatus('running');
    this._output = [];

    this.addOutput(`[${this.config.role.toUpperCase()}] Starting...`);

    const args = [
      'claude',
      '--model', 'claude-opus-4-5-20251101',
      '--output-format', 'stream-json',  // Enable streaming JSON output
      '--input-format', 'stream-json',   // Accept input via stdin as JSON
      '--verbose',  // Required for stream-json with -p
      '-p', '',     // Empty prompt, actual prompt comes from stdin
    ];

    // Set permission mode based on agent config
    if (this.config.permissionMode === 'plan') {
      args.push('--permission-mode', 'plan');
    } else {
      args.push('--dangerously-skip-permissions');
    }

    // Add system prompt if configured
    if (this.config.systemPrompt) {
      args.push('--append-system-prompt', this.config.systemPrompt);
    }

    this.addOutput(`[Working dir: ${this.config.workingDir}]`);

    try {
      this.process = Bun.spawn(args, {
        cwd: this.config.workingDir,
        stdin: 'pipe',   // Enable stdin for prompt input
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          NO_COLOR: '1',
        },
      });

      // Send the prompt via stdin as stream-json format
      if (this.process.stdin && typeof this.process.stdin !== 'number') {
        const userMessage = JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: prompt,
          },
        });
        this.process.stdin.write(userMessage + '\n');
        this.process.stdin.end();
      }

      // Start streaming stdout and stderr concurrently
      const streamPromises: Promise<void>[] = [];

      if (this.process.stdout && typeof this.process.stdout !== 'number') {
        streamPromises.push(this.streamJsonOutput(this.process.stdout));
      }
      if (this.process.stderr && typeof this.process.stderr !== 'number') {
        streamPromises.push(this.streamStderr(this.process.stderr));
      }

      // Wait for process to complete AND streams to finish
      const [exitCode] = await Promise.all([
        this.process.exited,
        ...streamPromises,
      ]);

      if (exitCode === 0) {
        this.addOutput(`[${this.config.role.toUpperCase()}] Complete`);
        this.setStatus('complete');
      } else {
        this.addOutput(`[${this.config.role.toUpperCase()}] Exited with code ${exitCode}`);
        this.setStatus('error');
        this.events.onError(`Process exited with code ${exitCode}`);
      }
    } catch (error) {
      this.setStatus('error');
      const message = error instanceof Error ? error.message : String(error);
      this.addOutput(`[ERROR] ${message}`);
      this.events.onError(message);
    } finally {
      this.process = null;
    }
  }

  /**
   * Stream and parse JSONL output from Claude Code
   */
  private async streamJsonOutput(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += this.decoder.decode(value, { stream: true });

        // Process complete lines (JSONL format - one JSON per line)
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            this.processJsonLine(line);
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        this.processJsonLine(buffer);
      }
    } catch {
      // Stream closed
    }
  }

  /**
   * Parse a single JSON line and extract displayable content
   */
  private processJsonLine(line: string): void {
    try {
      const msg = JSON.parse(line) as StreamMessage;

      // Handle different message types
      if (msg.type === 'system') {
        if (msg.subtype === 'init') {
          this.addOutput('[Session initialized]');
        } else if (msg.subtype === 'result') {
          // Capture final token counts from result
          if (msg.session) {
            this._tokenUsage.inputTokens = msg.session.input_tokens || 0;
            this._tokenUsage.outputTokens = msg.session.output_tokens || 0;
            this._tokenUsage.totalCostUsd = msg.session.total_cost || msg.total_cost_usd || 0;
            this.events.onTokenUpdate?.(this._tokenUsage);
          }
          if (msg.duration_ms) {
            this.addOutput(`[Duration: ${(msg.duration_ms / 1000).toFixed(1)}s]`);
          }
          if (msg.total_cost_usd) {
            this.addOutput(`[Cost: $${msg.total_cost_usd.toFixed(4)}]`);
          }
          const totalTokens = this._tokenUsage.inputTokens + this._tokenUsage.outputTokens;
          if (totalTokens > 0) {
            this.addOutput(`[Tokens: ${totalTokens.toLocaleString()} (in: ${this._tokenUsage.inputTokens.toLocaleString()}, out: ${this._tokenUsage.outputTokens.toLocaleString()})]`);
          }
        }
      } else if (msg.type === 'assistant' && msg.message?.content) {
        // Extract text content from assistant messages
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) {
            // Split long text into lines for display
            const textLines = block.text.split('\n');
            for (const textLine of textLines) {
              if (textLine.trim()) {
                this.addOutput(textLine);
              }
            }
          } else if (block.type === 'tool_use' && block.tool_use) {
            this.addOutput(`[Tool: ${block.tool_use.name}]`);
          } else if (block.type === 'tool_result' && block.tool_result) {
            // Show truncated tool result
            const result = block.tool_result.content;
            if (result && result.length > 100) {
              this.addOutput(`[Tool result: ${result.substring(0, 100)}...]`);
            } else if (result) {
              this.addOutput(`[Tool result: ${result}]`);
            }
          }
        }
      }
    } catch {
      // Not valid JSON, just display as-is
      if (line.trim()) {
        this.addOutput(line);
      }
    }
  }

  /**
   * Stream stderr (usually errors/warnings)
   */
  private async streamStderr(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += this.decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            this.addOutput(`[stderr] ${line}`);
          }
        }
      }

      if (buffer.trim()) {
        this.addOutput(`[stderr] ${buffer}`);
      }
    } catch {
      // Stream closed
    }
  }

  /**
   * Kill the session
   */
  kill(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.setStatus('error');
      this.events.onError('Session killed');
    }
  }

  /**
   * Check if session is active
   */
  get isRunning(): boolean {
    return this._status === 'running';
  }
}
