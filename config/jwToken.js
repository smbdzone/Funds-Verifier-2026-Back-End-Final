import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
dotenv.config()

const generateToken = (id) => {
  // 30m to match the 30-minute idle-logout window (authMiddleware + refresh).
  const token = jwt.sign({ id }, process.env.SECRET_KEY, { expiresIn: '30m' })
  return token
}

export default generateToken
