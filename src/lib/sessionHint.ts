// Remembers (per browser) that a parent session was opened here, so the login
// page only probes the server for an existing session when one is likely —
// first-time visitors no longer trigger a 401 on load. Storage can be blocked
// (private mode), so every access is guarded; without it the probe just runs.
const KEY = "parent-session-hint";

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

export function setSessionHint(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearSessionHint(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
