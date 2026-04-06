import { DEFAULT_SNIPPET_COLOR } from "../App";

export function normalizeHexColor(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed}`;
  }
  return DEFAULT_SNIPPET_COLOR;
}
function getReadableTextColor(backgroundHex: string): string {
  const normalized = normalizeHexColor(backgroundHex);
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness >= 140 ? "#1f1f1f" : "#ffffff";
} // Runtime render API base comes from `public/config.json` (fetched at app start)
// or from `REACT_APP_RENDER_API_BASE`. The actual request code lives inside
// the `App` component so it can access the loaded base URL.
export async function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    new Notification(title, { body });
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      new Notification(title, { body });
      return true;
    }
  }

  return false;
}
