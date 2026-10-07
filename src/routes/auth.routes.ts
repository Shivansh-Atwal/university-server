import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../models/User.js';
import { email, objectId, optDate, optEnum, optStr, reqStr } from '../validators/common.js';

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

router.post(
  '/login',
  loginLimiter,
  validate({ body: z.object({ email, password: z.string().min(1, 'Password is required'), role: z.enum(ROLES).optional() }) }),
  authController.login,
);
const signupLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

router.get('/programs', authController.signupPrograms);
router.post(
  '/signup',
  signupLimiter,
  validate({
    body: z.object({
      name: reqStr('Name').max(100),
      email,
      password: z.string().min(8, 'Use at least 8 characters').max(128),
      program: objectId,
      phone: optStr,
      dob: optDate,
      gender: optEnum(['male', 'female', 'other']),
    }),
  }),
  authController.signup,
);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.post(
  '/change-password',
  authenticate,
  validate({
    body: z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, 'Use at least 8 characters'),
      })
      .refine((v) => v.currentPassword !== v.newPassword, {
        message: 'New password must differ from the current one',
        path: ['newPassword'],
      }),
  }),
  authController.changePassword,
);

export default router;
