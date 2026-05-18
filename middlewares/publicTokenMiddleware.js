import jwt from 'jsonwebtoken'
function normalizeIp(ip) {
  if (ip === '::1') return '127.0.0.1'
  if (ip?.startsWith('::ffff:')) return ip.replace('::ffff:', '')
  return ip
}

export function publicTokenMiddleware(req, res, next) {
  if (req.user) return next()

  const token = req.headers['x-public-token']
  if (!token) return next()

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY)

    const reqIp = normalizeIp(req.ip)
    const tokenIp = normalizeIp(decoded.ip)

    if (reqIp !== tokenIp) {
      throw new Error(`IP mismatch ${reqIp} vs ${tokenIp}`)
    }

    req.publicUser = decoded
  } catch (err) {
    console.log('Public token rejected:', err.message)
  }

  next()
}
