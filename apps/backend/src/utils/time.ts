export const nowIso = (): string => new Date().toISOString();

export const addHoursIso = (iso: string, hours: number): string => {
  const d = new Date(iso);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
};

export const epochSecToIso = (epochSec?: number | null): string | null => {
  if (!epochSec) return null;
  return new Date(epochSec * 1000).toISOString();
};

export const dateKeyForTimezone = (date: Date, timeZone: string): string => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(date);
};
