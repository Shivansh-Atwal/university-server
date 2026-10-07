import { env } from '../config/env.js';
import { Faculty, Student } from '../models/people.js';
import { RefreshToken, User, type Role, type UserDoc } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { hashToken, newJti, signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens.js';
import { Program } from '../models/academic.js';
import { notificationService } from './notification.service.js';

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  program: string;
  phone?: string;
  dob?: Date;
  gender?: 'male' | 'female' | 'other';
}

async function findProfile(userId: string, role: string) {
  if (role === 'student') {
    return Student.findOne({ user: userId })
      .populate('program', 'name code totalSemesters')
      .populate('department', 'name code')
      .populate('section', 'name semesterNumber room')
      .populate('transportRoute', 'routeNo name')
      .lean();
  }
  if (role === 'faculty') {
    return Faculty.findOne({ user: userId }).populate('department', 'name code').lean();
  }
  return null;
}

async function issueTokens(user: UserDoc, userAgent?: string) {
  const profile = await findProfile(user.id, user.role);
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    profileId: profile?._id?.toString(),
  });
  const jti = newJti();
  const refreshToken = signRefreshToken(user.id, jti);
  await RefreshToken.create({
    user: user._id,
    jti,
    tokenHash: hashToken(refreshToken),
    userAgent,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
  });
  return { user: user.toJSON(), profile, accessToken, refreshToken };
}

export const authService = {
  /** `portal` restricts the sign-in to accounts of that role (each role has its own login page). */
  async login(emailAddr: string, password: string, userAgent?: string, portal?: Role) {
    const user = (await User.findOne({ email: emailAddr.toLowerCase() }).select('+password')) as UserDoc | null;
    if (!user || !(await user.comparePassword(password))) {
      throw ApiError.unauthorized('Invalid email or password');
    }
    if (portal && user.role !== portal) {
      throw ApiError.forbidden(`This is not ${portal === 'admin' ? 'an admin' : `a ${portal}`} account. Use the ${user.role} sign-in page.`);
    }
    if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated');
    user.lastLoginAt = new Date();
    await user.save();
    return issueTokens(user, userAgent);
  },

  /** Programs a prospective student can register for (public, shown on the sign-up form). */
  async signupPrograms() {
    return Program.find().select('name code degree department').populate('department', 'name code').sort('name').lean();
  },

  /**
   * Student self-registration. Creates the user and a student profile in semester 1 with a
   * generated enrollment number; section and other details are assigned later by an admin.
   */
  async signup(data: SignupInput, userAgent?: string) {
    const program = await Program.findById(data.program).lean();
    if (!program) throw ApiError.badRequest('Select a valid program', { program: 'Select a valid program' });
    if (await User.exists({ email: data.email })) {
      throw new ApiError(409, 'An account with this email already exists', { email: 'Already registered' });
    }

    const user = await User.create({ name: data.name, email: data.email, password: data.password, phone: data.phone, role: 'student' });
    try {
      const year = new Date().getFullYear();
      const prefix = `NBU${String(year).slice(2)}${program.code.replace(/^BT/, '')}`;
      // The unique index on enrollmentNo settles races between concurrent sign-ups; retry with the next number.
      for (let attempt = 0; ; attempt++) {
        const last = await Student.findOne({ enrollmentNo: new RegExp(`^${prefix}\\d+$`) })
          .sort('-enrollmentNo')
          .select('enrollmentNo')
          .lean();
        const next = (last ? parseInt(last.enrollmentNo.slice(prefix.length), 10) : 0) + 1 + attempt;
        try {
          await Student.create({
            user: user._id,
            enrollmentNo: `${prefix}${String(next).padStart(4, '0')}`,
            department: program.department,
            program: program._id,
            currentSemester: 1,
            batch: `${year}-${String(year + (program.durationYears ?? 4)).slice(2)}`,
            dob: data.dob,
            gender: data.gender,
            admissionDate: new Date(),
          });
          break;
        } catch (err) {
          const duplicate = (err as { code?: number; keyPattern?: Record<string, unknown> }).code === 11000;
          if (!duplicate || !(err as { keyPattern?: Record<string, unknown> }).keyPattern?.enrollmentNo || attempt >= 5) throw err;
        }
      }
    } catch (err) {
      await User.deleteOne({ _id: user._id });
      throw err;
    }

    const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
    await notificationService.toUsers(
      admins.map((a) => a._id),
      { title: 'New student registration', message: `${data.name} registered for ${program.code}. Assign a section.`, type: 'info', link: '/admin/students?sort=-createdAt' },
    );
    return issueTokens(user as unknown as UserDoc, userAgent);
  },

  /** Rotates the refresh token. Reuse of an already-rotated token revokes every session for that user. */
  async refresh(token: string | undefined, userAgent?: string) {
    if (!token) throw ApiError.unauthorized('No refresh token');
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw ApiError.unauthorized('Invalid refresh token');
    }
    const stored = await RefreshToken.findOneAndDelete({ jti: payload.jti });
    if (!stored || stored.tokenHash !== hashToken(token)) {
      await RefreshToken.deleteMany({ user: payload.sub });
      throw ApiError.unauthorized('Refresh token reuse detected; please sign in again');
    }
    const user = (await User.findById(payload.sub)) as UserDoc | null;
    if (!user || !user.isActive) throw ApiError.unauthorized('Account unavailable');
    return issueTokens(user, userAgent);
  },

  async logout(token: string | undefined) {
    if (!token) return;
    try {
      const { jti } = verifyRefreshToken(token);
      await RefreshToken.deleteOne({ jti });
    } catch {
      /* already invalid */
    }
  },

  async me(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound('User not found');
    return { user: user.toJSON(), profile: await findProfile(user.id, user.role) };
  },

  async changePassword(userId: string, current: string, next: string) {
    const user = (await User.findById(userId).select('+password')) as UserDoc | null;
    if (!user || !(await user.comparePassword(current))) {
      throw ApiError.badRequest('Current password is incorrect', { currentPassword: 'Incorrect password' });
    }
    user.password = next;
    await user.save();
    await RefreshToken.deleteMany({ user: user._id });
  },
};
