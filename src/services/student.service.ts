import mongoose from 'mongoose';
import { Course, DAYS, TimetableEntry } from '../models/academic.js';
import {
  Circular,
  Event,
  Fee,
  Holiday,
  LeaveRequest,
  Notification,
  Settings,
  UniversityRequest,
} from '../models/administration.js';
import { Assignment, AttendanceSession, DiaryEntry, Exam, Result, Submission } from '../models/coursework.js';
import { Student } from '../models/people.js';
import { ApiError } from '../utils/ApiError.js';
import { paginated, type ListOptions } from '../utils/query.js';
import type { StoredFile } from '../middleware/upload.js';
import { notificationService } from './notification.service.js';
import { splitUserFields } from './people.service.js';
import { User } from '../models/User.js';

const oid = (id: unknown) => new mongoose.Types.ObjectId(String(id));

export async function loadStudent(studentId: string) {
  const s = await Student.findById(studentId).lean();
  if (!s) throw ApiError.notFound('Student profile not found');
  return s;
}

/** Courses of the student's section; falls back to program + semester when no section is assigned. */
async function courseIdsFor(student: Awaited<ReturnType<typeof loadStudent>>) {
  const filter = student.section
    ? { sections: student.section }
    : { program: student.program, semesterNumber: student.currentSemester };
  const courses = await Course.find(filter).select('_id').lean();
  return courses.map((c) => c._id);
}

/** Weekday name as stored on timetable entries (Sunday never matches an entry). */
export function todayName(date = new Date()) {
  return ['Sunday', ...DAYS][date.getDay()] as (typeof DAYS)[number];
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

async function attendanceByCourse(studentId: string) {
  const sid = oid(studentId);
  return AttendanceSession.aggregate<{
    _id: mongoose.Types.ObjectId;
    total: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
  }>([
    { $match: { 'records.student': sid } },
    { $unwind: '$records' },
    { $match: { 'records.student': sid } },
    {
      $group: {
        _id: '$course',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$records.status', 'present'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$records.status', 'late'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$records.status', 'absent'] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ['$records.status', 'excused'] }, 1, 0] } },
      },
    },
  ]);
}

const pct = (attended: number, total: number) => (total ? Math.round((attended / total) * 1000) / 10 : 0);

export const studentPortalService = {
  async dashboard(studentId: string, userId: string) {
    const student = await loadStudent(studentId);
    const courseIds = await courseIdsFor(student);
    const today = startOfToday();
    const [
      todayClasses,
      attendance,
      pendingAssignments,
      upcomingExams,
      unreadNotifications,
      fees,
      holidays,
      events,
      circulars,
      settings,
    ] = await Promise.all([
      student.section
        ? TimetableEntry.find({ section: student.section, day: todayName() })
            .sort('startTime')
            .populate('course', 'code title')
            .populate({ path: 'faculty', select: 'user', populate: { path: 'user', select: 'name' } })
            .lean()
        : [],
      attendanceByCourse(studentId),
      student.section
        ? Assignment.find({ section: student.section, status: 'published', dueDate: { $gte: new Date() } })
            .select('_id')
            .lean()
            .then(async (list) => {
              const done = await Submission.countDocuments({
                student: studentId,
                assignment: { $in: list.map((a) => a._id) },
              });
              return list.length - done;
            })
        : 0,
      Exam.find({
        course: { $in: courseIds },
        date: { $gte: today },
        $or: [{ section: student.section }, { section: null }],
      })
        .sort('date')
        .limit(3)
        .populate('course', 'code title')
        .lean(),
      Notification.countDocuments({ user: userId, read: false }),
      Fee.find({ student: studentId, status: { $in: ['pending', 'partial', 'overdue'] } }).lean(),
      Holiday.find({ date: { $gte: today } }).sort('date').limit(3).lean(),
      Event.find({ startDate: { $gte: today } }).sort('startDate').limit(3).lean(),
      Circular.find({ audience: { $in: ['all', 'students'] } }).sort('-publishedAt').limit(3).lean(),
      Settings.findOne({ key: 'global' }).lean(),
    ]);

    const totals = attendance.reduce(
      (acc, a) => ({ total: acc.total + a.total, attended: acc.attended + a.present + a.late }),
      { total: 0, attended: 0 },
    );

    return {
      todayClasses,
      stats: {
        attendance: pct(totals.attended, totals.total),
        attendanceThreshold: settings?.attendanceThreshold ?? 75,
        courses: courseIds.length,
        pendingAssignments,
        unreadNotifications,
        feeDue: fees.reduce((sum, f) => sum + (f.amount - (f.paidAmount ?? 0)), 0),
        cgpa: student.cgpa ?? 0,
      },
      upcomingExams,
      holidays,
      events,
      circulars,
    };
  },

  async updateProfile(studentId: string, userId: string, data: Record<string, unknown>) {
    const { user, profile } = splitUserFields(data);
    const allowedProfile = ['address', 'bloodGroup', 'guardian.name', 'guardian.relation', 'guardian.phone'];
    const set = Object.fromEntries(Object.entries(profile).filter(([k]) => allowedProfile.includes(k)));
    if (Object.keys(set).length) await Student.updateOne({ _id: studentId }, { $set: set });
    const userSet: Record<string, unknown> = {};
    if (user.phone !== undefined) userSet.phone = user.phone;
    if (user.avatar !== undefined) userSet.avatar = user.avatar;
    if (data.avatar) userSet.avatar = data.avatar;
    if (Object.keys(userSet).length) await User.updateOne({ _id: userId }, { $set: userSet });
  },

  async courses(studentId: string) {
    const student = await loadStudent(studentId);
    const ids = await courseIdsFor(student);
    const [courses, attendance] = await Promise.all([
      Course.find({ _id: { $in: ids } })
        .sort('code')
        .populate({
          path: 'faculty',
          select: 'user designation',
          populate: { path: 'user', select: 'name email avatar' },
        })
        .lean(),
      attendanceByCourse(studentId),
    ]);
    const map = new Map(attendance.map((a) => [String(a._id), a]));
    return courses.map((c) => {
      const a = map.get(String(c._id));
      return { ...c, attendance: a ? pct(a.present + a.late, a.total) : null };
    });
  },

  async attendanceSummary(studentId: string) {
    const student = await loadStudent(studentId);
    const ids = await courseIdsFor(student);
    const [courses, rows, settings] = await Promise.all([
      Course.find({ _id: { $in: ids } }).select('code title type').sort('code').lean(),
      attendanceByCourse(studentId),
      Settings.findOne({ key: 'global' }).lean(),
    ]);
    const threshold = settings?.attendanceThreshold ?? 75;
    const map = new Map(rows.map((r) => [String(r._id), r]));
    const items = courses.map((c) => {
      const r = map.get(String(c._id)) ?? { total: 0, present: 0, late: 0, absent: 0, excused: 0 };
      const attended = r.present + r.late;
      const percentage = pct(attended, r.total);
      // Classes needed to reach the threshold, or classes that can still be skipped.
      const t = threshold / 100;
      const needed = percentage < threshold ? Math.ceil((t * r.total - attended) / (1 - t)) : 0;
      const canSkip = percentage >= threshold ? Math.floor(attended / t - r.total) : 0;
      return {
        course: c,
        total: r.total,
        present: r.present,
        late: r.late,
        absent: r.absent,
        excused: r.excused,
        percentage,
        needed,
        canSkip,
      };
    });
    const total = items.reduce((s, i) => s + i.total, 0);
    const attended = items.reduce((s, i) => s + i.present + i.late, 0);
    return { threshold, overall: pct(attended, total), total, attended, items };
  },

  async attendanceDetail(studentId: string, courseId: string, opts: ListOptions) {
    const sid = oid(studentId);
    const filter = { course: oid(courseId), 'records.student': sid };
    const [sessions, total] = await Promise.all([
      AttendanceSession.find(filter, { date: 1, startTime: 1, topic: 1, records: { $elemMatch: { student: sid } } })
        .sort('-date')
        .skip(opts.skip)
        .limit(opts.limit)
        .lean(),
      AttendanceSession.countDocuments(filter),
    ]);
    const items = sessions.map((s) => ({
      _id: s._id,
      date: s.date,
      startTime: s.startTime,
      topic: s.topic,
      status: s.records?.[0]?.status ?? 'absent',
    }));
    return paginated(items, total, opts);
  },

  async timetable(studentId: string) {
    const student = await loadStudent(studentId);
    if (!student.section) return [];
    return TimetableEntry.find({ section: student.section })
      .sort('startTime')
      .populate('course', 'code title type')
      .populate({ path: 'faculty', select: 'user', populate: { path: 'user', select: 'name' } })
      .lean();
  },

  async assignments(studentId: string, status: string | undefined, opts: ListOptions) {
    const student = await loadStudent(studentId);
    if (!student.section) return paginated([], 0, opts);
    const list = await Assignment.find({ section: student.section, status: { $ne: 'draft' } })
      .sort('-dueDate')
      .populate('course', 'code title')
      .lean();
    const subs = await Submission.find({ student: studentId, assignment: { $in: list.map((a) => a._id) } }).lean();
    const subMap = new Map(subs.map((s) => [String(s.assignment), s]));
    const now = new Date();
    let items = list.map((a) => {
      const submission = subMap.get(String(a._id)) ?? null;
      const state = submission
        ? submission.status === 'graded'
          ? 'graded'
          : 'submitted'
        : a.dueDate < now
          ? 'overdue'
          : 'pending';
      return { ...a, submission, state };
    });
    if (status) items = items.filter((i) => i.state === status);
    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter((i) => i.title.toLowerCase().includes(q));
    }
    return paginated(items.slice(opts.skip, opts.skip + opts.limit), items.length, opts);
  },

  async assignment(studentId: string, assignmentId: string) {
    const student = await loadStudent(studentId);
    const a = await Assignment.findOne({ _id: assignmentId, section: student.section })
      .populate('course', 'code title')
      .populate({ path: 'faculty', select: 'user', populate: { path: 'user', select: 'name' } })
      .lean();
    if (!a) throw ApiError.notFound('Assignment not found');
    const submission = await Submission.findOne({ assignment: assignmentId, student: studentId }).lean();
    return { ...a, submission };
  },

  async submitAssignment(studentId: string, assignmentId: string, text: string | undefined, files: StoredFile[]) {
    const student = await loadStudent(studentId);
    const a = await Assignment.findOne({ _id: assignmentId, section: student.section, status: 'published' });
    if (!a) throw ApiError.notFound('Assignment not found or closed');
    if (!text && !files.length) throw ApiError.badRequest('Add a note or attach at least one file');
    const existing = await Submission.findOne({ assignment: assignmentId, student: studentId });
    if (existing?.status === 'graded') throw ApiError.badRequest('This assignment has already been graded');
    const status = new Date() > a.dueDate ? 'late' : 'submitted';
    return Submission.findOneAndUpdate(
      { assignment: assignmentId, student: studentId },
      { text, files, status, submittedAt: new Date() },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).lean();
  },

  async exams(studentId: string, when: string | undefined) {
    const student = await loadStudent(studentId);
    const ids = await courseIdsFor(student);
    const filter: Record<string, unknown> = {
      course: { $in: ids },
      $or: [{ section: student.section }, { section: null }],
    };
    if (when === 'upcoming') filter.date = { $gte: startOfToday() };
    if (when === 'past') filter.date = { $lt: startOfToday() };
    return Exam.find(filter)
      .sort(when === 'past' ? '-date' : 'date')
      .populate('course', 'code title credits')
      .lean();
  },

  async results(studentId: string) {
    const published = await Exam.find({ resultsPublished: true }).select('_id').lean();
    const results = await Result.find({ student: studentId, exam: { $in: published.map((e) => e._id) } })
      .populate('exam', 'name type date maxMarks passingMarks')
      .populate('course', 'code title credits semesterNumber')
      .sort('-createdAt')
      .lean();

    // SGPA from end-term results, credit weighted.
    const bySem = new Map<number, { credits: number; points: number }>();
    for (const r of results) {
      const exam = r.exam as unknown as { type?: string } | null;
      const course = r.course as unknown as { credits?: number; semesterNumber?: number } | null;
      if (exam?.type !== 'End Term' || !course) continue;
      const sem = course.semesterNumber ?? 0;
      const entry = bySem.get(sem) ?? { credits: 0, points: 0 };
      entry.credits += course.credits ?? 0;
      entry.points += (course.credits ?? 0) * (r.gradePoints ?? 0);
      bySem.set(sem, entry);
    }
    const semesters = [...bySem.entries()]
      .sort(([a], [b]) => a - b)
      .map(([semesterNumber, v]) => ({
        semesterNumber,
        credits: v.credits,
        sgpa: v.credits ? Math.round((v.points / v.credits) * 100) / 100 : 0,
      }));
    const totalCredits = semesters.reduce((s, x) => s + x.credits, 0);
    const cgpa = totalCredits
      ? Math.round((semesters.reduce((s, x) => s + x.sgpa * x.credits, 0) / totalCredits) * 100) / 100
      : 0;
    return { items: results, summary: { cgpa, semesters } };
  },

  async fees(studentId: string) {
    const items = await Fee.find({ student: studentId }).sort('-dueDate').lean();
    const now = new Date();
    const normalized = items.map((f) => ({
      ...f,
      status: f.status === 'pending' && f.dueDate < now ? 'overdue' : f.status,
      balance: Math.max(0, f.amount - (f.paidAmount ?? 0)),
    }));
    const summary = normalized.reduce(
      (acc, f) => ({
        total: acc.total + f.amount,
        paid: acc.paid + (f.paidAmount ?? 0),
        due: acc.due + (f.status === 'waived' ? 0 : f.balance),
      }),
      { total: 0, paid: 0, due: 0 },
    );
    return { items: normalized, summary };
  },

  /** Simulated payment gateway: records a successful payment immediately. */
  async payFee(studentId: string, feeId: string, amount: number, method: string) {
    const fee = await Fee.findOne({ _id: feeId, student: studentId });
    if (!fee) throw ApiError.notFound('Fee not found');
    const balance = fee.amount - (fee.paidAmount ?? 0);
    if (balance <= 0 || fee.status === 'waived') throw ApiError.badRequest('Nothing to pay for this fee');
    if (amount > balance) throw ApiError.badRequest(`Amount exceeds the balance of ${balance}`);
    const transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
    fee.payments.push({ amount, method: method as 'online', transactionId, paidAt: new Date() });
    fee.paidAmount = (fee.paidAmount ?? 0) + amount;
    fee.status = fee.paidAmount >= fee.amount ? 'paid' : 'partial';
    await fee.save();
    return { fee: fee.toObject(), transactionId };
  },

  async diary(studentId: string, courseId: string | undefined, opts: ListOptions) {
    const student = await loadStudent(studentId);
    if (!student.section) return paginated([], 0, opts);
    const filter: Record<string, unknown> = { section: student.section };
    if (courseId) filter.course = courseId;
    const [items, total] = await Promise.all([
      DiaryEntry.find(filter)
        .sort('-date')
        .skip(opts.skip)
        .limit(opts.limit)
        .populate('course', 'code title')
        .populate({ path: 'faculty', select: 'user', populate: { path: 'user', select: 'name' } })
        .lean(),
      DiaryEntry.countDocuments(filter),
    ]);
    return paginated(items, total, opts);
  },

  async createLeave(studentId: string, userId: string, data: Record<string, unknown>) {
    const settings = await Settings.findOne({ key: 'global' }).lean();
    if (settings && settings.allowStudentLeaveRequests === false) {
      throw ApiError.forbidden('Leave requests are currently disabled');
    }
    const leave = await LeaveRequest.create({ ...data, requester: userId, role: 'student', student: studentId });
    // Notify the class advisor, if any.
    const student = await Student.findById(studentId)
      .populate({ path: 'section', select: 'classAdvisor', populate: { path: 'classAdvisor', select: 'user' } })
      .lean();
    const advisor = (student?.section as unknown as { classAdvisor?: { user?: unknown } } | undefined)?.classAdvisor;
    if (advisor?.user) {
      await notificationService.toUsers([advisor.user as string], {
        title: 'New leave request',
        message: `A student in your section requested ${data.type ?? 'personal'} leave.`,
        type: 'leave',
        link: '/faculty/leaves',
      });
    }
    return leave;
  },

  async createRequest(studentId: string, userId: string, data: Record<string, unknown>) {
    return UniversityRequest.create({ ...data, requester: userId, student: studentId });
  },
};
