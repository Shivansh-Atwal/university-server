import { Router } from 'express';
import { authorize, requireProfile } from '../middleware/auth.js';
import { handleUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { LeaveRequest, Notification, Settings, UniversityRequest } from '../models/administration.js';
import { User } from '../models/User.js';
import { reviewLeave } from '../services/faculty.service.js';
import { notificationService } from '../services/notification.service.js';
import { studentPortalService } from '../services/student.service.js';
import { ApiError } from '../utils/ApiError.js';
import { buildFilters, buildSearch, paginated, parseListOptions } from '../utils/query.js';
import { idParam } from '../validators/common.js';
import { leaveRequestSchema, respondRequestSchema, reviewLeaveSchema, settingsSchema, universityRequestSchema, } from '../validators/resources.js';
const router = Router();
// ---------- uploads ----------
router.post('/uploads', ...handleUpload('files', 5), (_req, res) => {
    if (!res.locals.files?.length)
        throw ApiError.badRequest('No files uploaded');
    res.status(201).json(res.locals.files);
});
// ---------- settings ----------
async function getSettings() {
    return ((await Settings.findOne({ key: 'global' }).populate('currentSemester', 'name academicYear').lean()) ??
        (await Settings.create({ key: 'global' })).toObject());
}
router.get('/settings', async (_req, res) => {
    res.json(await getSettings());
});
router.put('/settings', authorize('admin'), validate({ body: settingsSchema }), async (req, res) => {
    await Settings.updateOne({ key: 'global' }, { $set: req.body }, { upsert: true, runValidators: true });
    res.json(await getSettings());
});
// ---------- notifications ----------
router.get('/notifications', async (req, res) => {
    const opts = parseListOptions(req);
    const filter = { user: req.user.id };
    if (req.query.unread === 'true')
        filter.read = false;
    if (req.query.type)
        filter.type = String(req.query.type);
    const [items, total, unread] = await Promise.all([
        Notification.find(filter).sort('-createdAt').skip(opts.skip).limit(opts.limit).lean(),
        Notification.countDocuments(filter),
        Notification.countDocuments({ user: req.user.id, read: false }),
    ]);
    res.json({ ...paginated(items, total, opts), unread });
});
router.get('/notifications/unread-count', async (req, res) => {
    res.json({ count: await Notification.countDocuments({ user: req.user.id, read: false }) });
});
router.patch('/notifications/read-all', async (req, res) => {
    await Notification.updateMany({ user: req.user.id, read: false }, { read: true });
    res.status(204).end();
});
router.patch('/notifications/:id/read', validate({ params: idParam }), async (req, res) => {
    await Notification.updateOne({ _id: req.params.id, user: req.user.id }, { read: true });
    res.status(204).end();
});
router.delete('/notifications/:id', validate({ params: idParam }), async (req, res) => {
    await Notification.deleteOne({ _id: req.params.id, user: req.user.id });
    res.status(204).end();
});
// ---------- leave requests ----------
router.get('/leaves', async (req, res) => {
    const opts = parseListOptions(req);
    const filter = buildFilters(req.query, ['status', 'type', 'role']);
    if (req.user.role !== 'admin')
        filter.requester = req.user.id;
    else if (opts.search) {
        const users = await User.find(buildSearch(opts.search, ['name', 'email'])).select('_id').lean();
        filter.requester = { $in: users.map((u) => u._id) };
    }
    const [items, total] = await Promise.all([
        LeaveRequest.find(filter)
            .sort(opts.sort)
            .skip(opts.skip)
            .limit(opts.limit)
            .populate('requester', 'name email role avatar')
            .populate('reviewedBy', 'name')
            .lean(),
        LeaveRequest.countDocuments(filter),
    ]);
    res.json(paginated(items, total, opts));
});
router.post('/leaves', authorize('student', 'faculty'), validate({ body: leaveRequestSchema }), async (req, res) => {
    const profileId = requireProfile(req);
    if (req.user.role === 'student') {
        return res.status(201).json(await studentPortalService.createLeave(profileId, req.user.id, req.body));
    }
    const leave = await LeaveRequest.create({ ...req.body, requester: req.user.id, role: 'faculty' });
    const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
    await notificationService.toUsers(admins.map((a) => a._id), { title: 'Faculty leave request', message: `${req.body.type ?? 'Personal'} leave awaiting review`, type: 'leave', link: '/admin/leaves' });
    res.status(201).json(leave);
});
router.patch('/leaves/:id/cancel', validate({ params: idParam }), async (req, res) => {
    const leave = await LeaveRequest.findOne({ _id: req.params.id, requester: req.user.id });
    if (!leave)
        throw ApiError.notFound('Leave request not found');
    if (leave.status !== 'pending')
        throw ApiError.badRequest('Only pending requests can be cancelled');
    leave.status = 'cancelled';
    await leave.save();
    res.json(leave);
});
router.patch('/leaves/:id/review', authorize('admin'), validate({ params: idParam, body: reviewLeaveSchema }), async (req, res) => {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave)
        throw ApiError.notFound('Leave request not found');
    res.json(await reviewLeave(leave, req.user.id, req.body.status, req.body.reviewRemarks));
});
// ---------- university (service) requests ----------
router.get('/requests', async (req, res) => {
    const opts = parseListOptions(req);
    const filter = {
        ...buildFilters(req.query, ['status', 'type']),
        ...buildSearch(opts.search, ['subject', 'description']),
    };
    if (req.user.role !== 'admin')
        filter.requester = req.user.id;
    const [items, total] = await Promise.all([
        UniversityRequest.find(filter)
            .sort(opts.sort)
            .skip(opts.skip)
            .limit(opts.limit)
            .populate('requester', 'name email avatar')
            .populate({ path: 'student', select: 'enrollmentNo program', populate: { path: 'program', select: 'code' } })
            .populate('handledBy', 'name')
            .lean(),
        UniversityRequest.countDocuments(filter),
    ]);
    res.json(paginated(items, total, opts));
});
router.post('/requests', authorize('student'), validate({ body: universityRequestSchema }), async (req, res) => {
    res.status(201).json(await studentPortalService.createRequest(requireProfile(req), req.user.id, req.body));
});
router.patch('/requests/:id/respond', authorize('admin'), validate({ params: idParam, body: respondRequestSchema }), async (req, res) => {
    const request = await UniversityRequest.findById(req.params.id);
    if (!request)
        throw ApiError.notFound('Request not found');
    Object.assign(request, {
        status: req.body.status,
        response: req.body.response,
        handledBy: req.user.id,
        resolvedAt: ['resolved', 'rejected'].includes(req.body.status) ? new Date() : undefined,
    });
    await request.save();
    await notificationService.toUsers([request.requester], {
        title: `Request ${req.body.status}`,
        message: `${request.type}: ${request.subject}`,
        type: 'request',
        link: '/student/requests',
    });
    res.json(request);
});
export default router;
//# sourceMappingURL=common.routes.js.map