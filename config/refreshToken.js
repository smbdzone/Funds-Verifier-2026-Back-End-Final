import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
dotenv.config()

const generateRefreshToken = (id) => {
  let token = jwt.sign({ id }, process.env.SECRET_KEY, { expiresIn: '3d' })
  return token
}

export default generateRefreshToken
