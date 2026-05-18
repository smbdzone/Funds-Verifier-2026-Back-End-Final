import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
dotenv.config()

const generateToken = (id) => {
  const token = jwt.sign({ id }, process.env.SECRET_KEY, { expiresIn: '15m' })
  return token
}

export default generateToken
