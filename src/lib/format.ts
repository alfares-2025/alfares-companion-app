/** Compact money text: "1,300 ₪" (the ₪ stays attached to the number). */
export function formatCurrency(value: number): string {
  return `${(value ?? 0).toLocaleString("en-US")} ₪`;
}

/** dd/mm/yyyy from an ISO-ish string; "—" when empty. */
export function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    const raw = String(value).trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${day}/${month}/${year}`;
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${d.getFullYear()}`;
  } catch {
    return value;
  }
}

/** First token of the guardian's name for the "أهلاً، …" heading. */
export function firstName(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "ولي الأمر";
  return trimmed.split(/\s+/)[0];
}

/** Time-of-day greeting. */
export function computeGreeting(): { text: string; isNight: boolean } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { text: "صباح الخير", isNight: false };
  if (hour >= 12 && hour < 18) return { text: "مساء الخير", isNight: false };
  return { text: "مساء الخير", isNight: true };
}
