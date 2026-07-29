import crypto from 'crypto'

const positiveIntegerFromEnv = (name, fallback) => {
  const value = Number.parseInt(process.env[name], 10)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export const OTP_TTL_MINUTES = positiveIntegerFromEnv('OTP_TTL_MINUTES', 10)
export const OTP_RESEND_COOLDOWN_SECONDS = positiveIntegerFromEnv(
  'OTP_RESEND_COOLDOWN_SECONDS',
  30,
)
export const OTP_MAX_ATTEMPTS = positiveIntegerFromEnv('OTP_MAX_ATTEMPTS', 5)

// Roles that must confirm a 6-digit email code after password login.
// Override with OTP_LOGIN_ROLES in .env (comma separated) to add/remove roles
// without touching code, e.g. OTP_LOGIN_ROLES=Evaluator,Sub-Evaluator,Trustee
const DEFAULT_OTP_LOGIN_ROLES = ['Evaluator', 'Sub-Evaluator']

const normalizeRoleKey = (role) =>
  String(role || '')
    .toLowerCase()
    .replace(/[\s._-]/g, '')

export function getOtpLoginRoles() {
  const configured = String(process.env.OTP_LOGIN_ROLES || '')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean)

  return configured.length ? configured : DEFAULT_OTP_LOGIN_ROLES
}

/** True when this user's role is gated behind the email OTP step. */
export function requiresLoginOtp(user) {
  if (!user?.role) return false
  const allowed = getOtpLoginRoles().map(normalizeRoleKey)
  return allowed.includes(normalizeRoleKey(user.role))
}

/** Cryptographically random 6-digit code, leading zeros allowed. */
export function generateOtpCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashOtpCode(code) {
  return crypto
    .createHash('sha256')
    .update(String(code || '').trim())
    .digest('hex')
}

export function sanitizeOtpCode(code) {
  const digits = String(code ?? '').replace(/\D/g, '')
  return digits.length === 6 ? digits : ''
}

/** Seconds the user still has to wait before another code may be sent. */
export function getResendWaitSeconds(sentAt) {
  if (!sentAt) return 0
  const elapsed = (Date.now() - new Date(sentAt).getTime()) / 1000
  const remaining = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed)
  return remaining > 0 ? remaining : 0
}

/** Hide most of the address so the UI can say where the code went. */
export function maskEmail(email) {
  const value = String(email || '').trim()
  const [local, domain] = value.split('@')
  if (!local || !domain) return value

  const visible = local.slice(0, local.length > 3 ? 2 : 1)
  return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 2))}@${domain}`
}
