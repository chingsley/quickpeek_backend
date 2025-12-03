import jwt from 'jsonwebtoken';
import { TokenPayload } from './../../common/types/index';



const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (err) {
    return null;
  }
};