const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(iso: string, n: number): string {
  const dt = parseISODate(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function fmtDate(iso: string): string {
  const dt = parseISODate(iso);
  return `${DOW[dt.getUTCDay()]}, ${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}`;
}

export function fmtSlash(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function fmtTime(t: string): string {
  const [hStr, m] = t.split(":");
  let h = Number(hStr);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (!h) h = 12;
  return `${h}:${m} ${ap}`;
}

export function dayLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  return fmtDate(iso);
}

export function stampLabel(ts: string, today: string): string {
  const dpart = ts.slice(0, 10);
  const tpart = ts.slice(11, 16);
  const dl = dpart === today ? "today" : fmtDate(dpart);
  return `${fmtTime(tpart)} · ${dl}`;
}
