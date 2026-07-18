const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The absolute close time, not a countdown. A relative label would need the current clock, which is
// impure to read during render, and it goes stale on a page that sits open. Rendered in UTC to match
// how the market titles state their own deadlines. Returns '' for an unparseable date so a bad row
// degrades to no label instead of "NaN".
export function formatCloseTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${hh}:${mm} UTC`
}
