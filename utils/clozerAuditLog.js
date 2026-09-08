export function logClozerEvent(event, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...details,
  }
  console.info('[ClozerAudit]', JSON.stringify(entry))
}
