export interface Column {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function pad(text: string, width: number, align: "left" | "right" | "center" = "left"): string {
  const visibleLength = stripAnsi(text).length;
  const padding = Math.max(0, width - visibleLength);

  if (align === "right") {
    return " ".repeat(padding) + text;
  }
  if (align === "center") {
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return " ".repeat(left) + text + " ".repeat(right);
  }
  return text + " ".repeat(padding);
}

function truncate(text: string, width: number): string {
  const visibleLength = stripAnsi(text).length;
  if (visibleLength <= width) return text;

  let visible = 0;
  let result = "";
  let inEscape = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === "\x1b") {
      inEscape = true;
      result += char;
      continue;
    }

    if (inEscape) {
      result += char;
      if (char === "m") {
        inEscape = false;
      }
      continue;
    }

    if (visible >= width - 1) {
      result += "…";
      break;
    }

    result += char;
    visible++;
  }

  return result + "\x1b[0m";
}

export function formatTable(columns: Column[], rows: string[][]): string {
  const lines: string[] = [];

  const header = columns
    .map((col) => pad(col.header, col.width, col.align))
    .join(" │ ");
  lines.push(header);

  const separator = columns
    .map((col) => "─".repeat(col.width))
    .join("─┼─");
  lines.push(separator);

  for (const row of rows) {
    const formattedRow = columns
      .map((col, i) => {
        const cell = row[i] ?? "";
        const truncated = truncate(cell, col.width);
        return pad(truncated, col.width, col.align);
      })
      .join(" │ ");
    lines.push(formattedRow);
  }

  return lines.join("\n");
}
