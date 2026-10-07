import { Router, type Request, type Response } from 'express';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Fee } from '../models/administration.js';
import { Student } from '../models/people.js';
import { analyticsService } from '../services/analytics.service.js';
import { notificationService } from '../services/notification.service.js';
import { facultyService, studentService } from '../services/people.service.js';
import { ApiError } from '../utils/ApiError.js';
import { z } from 'zod';
import { RefreshToken, User } from '../models/User.js';
import { buildSearch, paginated, parseListOptions } from '../utils/query.js';
import { email, idParam, optBool, optStr, reqStr } from '../validators/common.js';
import { bulkFeeSchema, facultySchema, studentSchema } from '../validators/resources.js';

const router = Router();
router.use(authorize('admin'));

router.get('/analytics', async (_req, res) => {
  res.json(await analyticsService.overview());
});

function peopleRoutes(path: string, service: typeof studentService, schema: typeof studentSchema | typeof facultySchema) {
  router.get(path, async (req: Request, res: Response) => {
    res.json(await service.list(req.query, parseListOptions(req)));
  });
  router.get(`${path}/:id`, validate({ params: idParam }), async (req, res) => {
    res.json(await service.get(String(req.params.id)));
  });
  router.post(path, validate({ body: schema }), async (req, res) => {
    res.status(201).json(await service.create(req.body));
  });
  router.patch(`${path}/:id`, validate({ params: idParam, body: schema.partial() }), async (req, res) => {
    res.json(await service.update(String(req.params.id), req.body));
  });
  router.delete(`${path}/:id`, validate({ params: idParam }), async (req, res) => {
    await service.remove(String(req.params.id));
    res.status(204).end();
  });
}

peopleRoutes('/students', studentService, studentSchema);
peopleRoutes('/faculty', facultyService, facultySchema);

// ---------- administrator accounts ----------
const adminSchema = z.object({
  name: reqStr('Name'),
  email,
  password: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(8, 'Use at least 8 characters').optional()),
  phone: optStr,
  isActive: optBool,
});

router.get('/admins', async (req, res) => {
  const opts = parseListOptions(req, 'name');
  const filter: Record<string, unknown> = { role: 'admin', ...buildSearch(opts.search, ['name', 'email']) };
  const [items, total] = await Promise.all([
    User.find(filter).sort(opts.sort).skip(opts.skip).limit(opts.limit).lean(),
    User.countDocuments(filter),
  ]);
  res.json(paginated(items, total, opts));
});

router.post('/admins', validate({ body: adminSchema }), async (req, res) => {
  if (!req.body.password) throw ApiError.badRequest('Password is required', { password: 'Password is required' });
  res.status(201).json(await User.create({ ...req.body, role: 'admin' }));
});

/** The signed-in admin cannot lock themselves out, and one active admin must always remain. */
async function assertNotLastAdmin(id: string, req: Request, action: string) {
  if (id === req.user!.id) throw ApiError.badRequest(`You cannot ${action} your own account`);
  const others = await User.countDocuments({ role: 'admin', isActive: true, _id: { $ne: id } });
  if (!others) throw ApiError.badRequest('At least one active administrator is required');
}

router.patch('/admins/:id', validate({ params: idParam, body: adminSchema.partial() }), async (req, res) => {
  const id = String(req.params.id);
  const user = await User.findOne({ _id: id, role: 'admin' }).select('+password');
  if (!user) throw ApiError.notFound('Administrator not found');
  if (req.body.isActive === false) await assertNotLastAdmin(id, req, 'deactivate');
  Object.assign(user, Object.fromEntries(Object.entries(req.body).filter(([, v]) => v !== undefined)));
  await user.save();
  if (req.body.password || req.body.isActive === false) await RefreshToken.deleteMany({ user: user._id });
  res.json(user);
});

router.delete('/admins/:id', validate({ params: idParam }), async (req, res) => {
  const id = String(req.params.id);
  await assertNotLastAdmin(id, req, 'delete');
  const user = await User.findOneAndDelete({ _id: id, role: 'admin' });
  if (!user) throw ApiError.notFound('Administrator not found');
  await RefreshToken.deleteMany({ user: user._id });
  res.status(204).end();
});

/** Raises the same fee for every active student in a program (optionally narrowed to semester/section). */
router.post('/fees/bulk', validate({ body: bulkFeeSchema }), async (req, res) => {
  const { program, semesterNumber, section, ...fee } = req.body;
  const filter: Record<string, unknown> = { program, status: 'active' };
  if (semesterNumber) filter.currentSemester = semesterNumber;
  if (section) filter.section = section;
  const students = await Student.find(filter).select('_id').lean();
  if (!students.length) throw ApiError.badRequest('No active students match these criteria');
  await Fee.insertMany(students.map((s) => ({ ...fee, student: s._id, semesterNumber })));
  await notificationService.toStudents(
    students.map((s) => s._id),
    { title: 'New fee due', message: `${fee.title}: ₹${fee.amount}`, type: 'fee', link: '/student/fees' },
  );
  res.status(201).json({ created: students.length });
});

export default router;
