const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const FG_RED = "\x1b[31m";
const FG_GREEN = "\x1b[32m";
const FG_YELLOW = "\x1b[33m";
const FG_BLUE = "\x1b[34m";
const FG_MAGENTA = "\x1b[35m";
const FG_CYAN = "\x1b[36m";
const FG_WHITE = "\x1b[37m";
const FG_GRAY = "\x1b[90m";

export function red(text: string): string {
  return `${FG_RED}${text}${RESET}`;
}

export function green(text: string): string {
  return `${FG_GREEN}${text}${RESET}`;
}

export function yellow(text: string): string {
  return `${FG_YELLOW}${text}${RESET}`;
}

export function blue(text: string): string {
  return `${FG_BLUE}${text}${RESET}`;
}

export function magenta(text: string): string {
  return `${FG_MAGENTA}${text}${RESET}`;
}

export function cyan(text: string): string {
  return `${FG_CYAN}${text}${RESET}`;
}

export function white(text: string): string {
  return `${FG_WHITE}${text}${RESET}`;
}

export function gray(text: string): string {
  return `${FG_GRAY}${text}${RESET}`;
}

export function bold(text: string): string {
  return `${BOLD}${text}${RESET}`;
}

export function dim(text: string): string {
  return `${DIM}${text}${RESET}`;
}

export function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return green(status);
    case "in_progress":
      return yellow(status);
    case "pending":
      return gray(status);
    default:
      return status;
  }
}

export function priorityColor(priority: string): string {
  switch (priority) {
    case "high":
      return red(priority);
    case "medium":
      return yellow(priority);
    case "low":
      return gray(priority);
    default:
      return priority;
  }
}
