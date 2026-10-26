// Build code ddMMyyyyHHmmss in Lima time, whatever the build machine's zone
// (Vercel builds in UTC). Used by vite.config.js and as the dev fallback.
const FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export function readableBuild(stamp) {
  const match = /^(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(stamp ?? '');
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match;
  const dateTime = `${year}-${month}-${day}T${hour}:${minute}:${second}-05:00`;
  const date = new Date(dateTime);
  if (!Number.isFinite(date.getTime()) || buildStamp(date) !== stamp) return null;
  return { label: `${day}/${month}/${year} · ${hour}:${minute}`, short: `${day}/${month}/${year} ${hour}:${minute}`, dateTime };
}

export function buildStamp(date = new Date()) {
  const parts = Object.fromEntries(FORMAT.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.day}${parts.month}${parts.year}${parts.hour}${parts.minute}${parts.second}`;
}
