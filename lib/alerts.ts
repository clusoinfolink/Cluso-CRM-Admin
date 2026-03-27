export type AlertToneClass = "inline-alert-success" | "inline-alert-warning" | "inline-alert-danger";

export function getAlertTone(message: string): AlertToneClass {
  const lower = message.toLowerCase();

  if (
    lower.includes("could not") ||
    lower.includes("error") ||
    lower.includes("failed") ||
    lower.includes("invalid") ||
    lower.includes("unauthorized")
  ) {
    return "inline-alert-danger";
  }

  if (lower.includes("no") || lower.includes("empty") || lower.includes("required")) {
    return "inline-alert-warning";
  }

  return "inline-alert-success";
}
