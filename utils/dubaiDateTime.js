/** UAE / Dubai timezone for all outbound email time references. */
export const DUBAI_TIMEZONE = 'Asia/Dubai'

/**
 * Format a date/time in Dubai (GST, UTC+4) for emails and notifications.
 * @param {Date|string|number} [value]
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatDubaiDateTime(value = new Date(), options = {}) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value || '')

  const formatted = date.toLocaleString('en-GB', {
    timeZone: DUBAI_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  })

  return `${formatted} (Dubai)`
}
