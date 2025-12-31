const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const absDiff = Math.abs(diff);

  if (absDiff < MINUTE) {
    return "just now";
  }

  if (absDiff < HOUR) {
    const minutes = Math.floor(absDiff / MINUTE);
    const unit = minutes === 1 ? "minute" : "minutes";
    return diff > 0 ? `in ${minutes} ${unit}` : `${minutes} ${unit} ago`;
  }

  if (absDiff < DAY) {
    const hours = Math.floor(absDiff / HOUR);
    const unit = hours === 1 ? "hour" : "hours";
    return diff > 0 ? `in ${hours} ${unit}` : `${hours} ${unit} ago`;
  }

  const days = Math.floor(absDiff / DAY);
  if (days < 30) {
    const unit = days === 1 ? "day" : "days";
    return diff > 0 ? `in ${days} ${unit}` : `${days} ${unit} ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    const unit = months === 1 ? "month" : "months";
    return diff > 0 ? `in ${months} ${unit}` : `${months} ${unit} ago`;
  }

  const years = Math.floor(months / 12);
  const unit = years === 1 ? "year" : "years";
  return diff > 0 ? `in ${years} ${unit}` : `${years} ${unit} ago`;
}

export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function parseDate(dateStr: string): string | undefined {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}
