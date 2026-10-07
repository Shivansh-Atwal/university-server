import { env, isProd } from '../config/env.js';
import { authService } from '../services/auth.service.js';
const COOKIE = 'rt';
const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
};
/**
 * The Android app runs on a different site than the API, where the browser will not send the
 * SameSite refresh cookie. It marks its requests with X-Client: native, receives the refresh
 * token in the response body and sends it back in the request body.
 */
const isNativeClient = (req) => req.get('x-client') === 'native';
const refreshTokenOf = (req) => (isNativeClient(req) && typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined) ?? req.cookies?.[COOKIE];
function send(req, res, result) {
    const { refreshToken, ...body } = result;
    if (isNativeClient(req)) {
        res.json({ ...body, refreshToken });
        return;
    }
    res.cookie(COOKIE, refreshToken, cookieOptions);
    res.json(body);
}
export const authController = {
    login: async (req, res) => {
        send(req, res, await authService.login(req.body.email, req.body.password, req.get('user-agent'), req.body.role));
    },
    signupPrograms: async (_req, res) => {
        res.json(await authService.signupPrograms());
    },
    signup: async (req, res) => {
        res.status(201);
        send(req, res, await authService.signup(req.body, req.get('user-agent')));
    },
    refresh: async (req, res) => {
        try {
            send(req, res, await authService.refresh(refreshTokenOf(req), req.get('user-agent')));
        }
        catch (err) {
            res.clearCookie(COOKIE, { path: cookieOptions.path });
            throw err;
        }
    },
    logout: async (req, res) => {
        await authService.logout(refreshTokenOf(req));
        res.clearCookie(COOKIE, { path: cookieOptions.path });
        res.status(204).end();
    },
    me: async (req, res) => {
        res.json(await authService.me(req.user.id));
    },
    changePassword: async (req, res) => {
        await authService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
        res.clearCookie(COOKIE, { path: cookieOptions.path });
        res.json({ message: 'Password updated. Please sign in again.' });
    },
};
//# sourceMappingURL=auth.controller.js.map