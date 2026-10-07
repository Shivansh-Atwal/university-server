import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/tokens.js';
export function authenticate(req, _res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token)
        return next(ApiError.unauthorized());
    try {
        const payload = verifyAccessToken(token);
        req.user = { id: payload.sub, role: payload.role, profileId: payload.profileId };
        next();
    }
    catch (err) {
        const msg = err instanceof jwt.TokenExpiredError ? 'Access token expired' : 'Invalid access token';
        next(ApiError.unauthorized(msg));
    }
}
/** Role-based access control. Use after `authenticate`. */
export const authorize = (...roles) => (req, _res, next) => {
    if (!req.user)
        return next(ApiError.unauthorized());
    if (roles.length && !roles.includes(req.user.role))
        return next(ApiError.forbidden());
    next();
};
/** Asserts the request comes from a student/faculty with a linked profile and returns its id. */
export function requireProfile(req) {
    if (!req.user?.profileId)
        throw ApiError.forbidden('No profile is linked to this account');
    return req.user.profileId;
}
//# sourceMappingURL=auth.js.map