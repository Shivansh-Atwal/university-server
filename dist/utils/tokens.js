import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
export function signAccessToken(payload) {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
        expiresIn: env.ACCESS_TOKEN_TTL,
    });
}
export function verifyAccessToken(token) {
    return jwt.verify(token, env.JWT_ACCESS_SECRET);
}
export function signRefreshToken(userId, jti) {
    return jwt.sign({ sub: userId, jti }, env.JWT_REFRESH_SECRET, {
        expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
    });
}
export function verifyRefreshToken(token) {
    return jwt.verify(token, env.JWT_REFRESH_SECRET);
}
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const newJti = () => crypto.randomUUID();
//# sourceMappingURL=tokens.js.map