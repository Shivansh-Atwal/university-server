import { Router, type Request } from 'express';
import { Course, Department, Program, Section, Semester, TimetableEntry } from '../models/academic.js';
import {
  Book,
  BookIssue,
  Circular,
  Document,
  Event,
  Fee,
  Holiday,
  Hostel,
  HostelAllocation,
  Placement,
  TransportRoute,
} from '../models/administration.js';
import { Assignment, AttendanceSession, Exam, Result } from '../models/coursework.js';
import { ApiError } from '../utils/ApiError.js';
import { notificationService } from '../services/notification.service.js';
import { gradeFor } from '../utils/grades.js';
import * as v from '../validators/resources.js';
import { crudRouter } from './crud.routes.js';

/**
 * Admin-managed resources. Reads are open to every authenticated role unless noted;
 * writes are admin-only. Each is mounted at /api/<name>.
 */
const router = Router();

const studentRef = {
  path: 'student',
  select: 'enrollmentNo user program',
  populate: [
    { path: 'user', select: 'name' },
    { path: 'program', select: 'code' },
  ],
};
const facultyRef = { path: 'faculty', select: 'employeeId user', populate: { path: 'user', select: 'name' } };

const audienceScope = (req: Request) => {
  if (req.user!.role === 'admin') return {};
  return { audience: { $in: ['all', req.user!.role === 'student' ? 'students' : 'faculty'] } };
};

router.use(
  '/departments',
  crudRouter({
    model: Department,
    schema: v.departmentSchema,
    searchFields: ['name', 'code'],
    populate: { path: 'hod', select: 'user designation', populate: { path: 'user', select: 'name' } },
    defaultSort: 'name',
  }),
);

router.use(
  '/programs',
  crudRouter({
    model: Program,
    schema: v.programSchema,
    searchFields: ['name', 'code'],
    filterFields: ['department', 'degree'],
    populate: { path: 'department', select: 'name code' },
    defaultSort: 'name',
  }),
);

router.use(
  '/semesters',
  crudRouter({
    model: Semester,
    schema: v.semesterSchema,
    searchFields: ['name', 'academicYear'],
    filterFields: ['academicYear', 'type', 'isCurrent'],
    defaultSort: '-startDate',
    afterCreate: async (_req, doc) => {
      const s = doc as { _id: unknown; isCurrent?: boolean };
      if (s.isCurrent) await Semester.updateMany({ _id: { $ne: s._id } }, { isCurrent: false });
    },
    afterUpdate: async (_req, doc) => {
      const s = doc as { _id: unknown; isCurrent?: boolean };
      if (s.isCurrent) await Semester.updateMany({ _id: { $ne: s._id } }, { isCurrent: false });
    },
  }),
);

router.use(
  '/sections',
  crudRouter({
    model: Section,
    schema: v.sectionSchema,
    searchFields: ['name', 'batch'],
    filterFields: ['program', 'semesterNumber', 'classAdvisor'],
    populate: [{ path: 'program', select: 'name code' }, { ...facultyRef, path: 'classAdvisor' }],
    defaultSort: 'semesterNumber,name',
  }),
);

router.use(
  '/courses',
  crudRouter({
    model: Course,
    schema: v.courseSchema,
    searchFields: ['code', 'title'],
    filterFields: ['department', 'program', 'semesterNumber', 'type', 'faculty', 'sections'],
    populate: [
      { path: 'department', select: 'name code' },
      { path: 'program', select: 'name code' },
      facultyRef,
      { path: 'sections', select: 'name semesterNumber' },
    ],
    defaultSort: 'code',
  }),
);

router.use(
  '/timetable',
  crudRouter({
    model: TimetableEntry,
    schema: v.timetableSchema,
    filterFields: ['section', 'faculty', 'course', 'day'],
    populate: [
      { path: 'course', select: 'code title' },
      { path: 'section', select: 'name semesterNumber program', populate: { path: 'program', select: 'code' } },
      facultyRef,
    ],
    defaultSort: 'day,startTime',
  }),
);

router.use(
  '/exams',
  crudRouter({
    model: Exam,
    schema: v.examSchema,
    searchFields: ['name', 'room'],
    filterFields: ['course', 'section', 'semester', 'type', 'resultsPublished', 'date'],
    populate: [
      { path: 'course', select: 'code title' },
      { path: 'section', select: 'name' },
      { path: 'semester', select: 'name' },
    ],
    defaultSort: '-date',
    afterUpdate: async (req, doc) => {
      const e = doc as { _id: string; name: string; resultsPublished?: boolean; course: { code: string } };
      if (req.body.resultsPublished === true && e.resultsPublished) {
        const results = await Result.find({ exam: e._id }).select('student').lean();
        await notificationService.toStudents(
          results.map((r) => r.student),
          { title: 'Results published', message: `${e.course.code} ${e.name}`, type: 'result', link: '/student/results' },
        );
      }
    },
  }),
);

router.use(
  '/results',
  crudRouter({
    model: Result,
    schema: v.resultSchema,
    read: ['admin'],
    filterFields: ['exam', 'student', 'course', 'grade'],
    populate: [{ path: 'exam', select: 'name type' }, { path: 'course', select: 'code title' }, studentRef],
    beforeCreate: (_req, data) => {
      const percentage = Math.round(((data.marksObtained as number) / (data.maxMarks as number)) * 1000) / 10;
      const band = gradeFor(percentage);
      return { ...data, percentage, grade: band.grade, gradePoints: band.points };
    },
  }),
);

router.use(
  '/fees',
  crudRouter({
    model: Fee,
    schema: v.feeSchema,
    read: ['admin'],
    searchFields: ['title', 'academicYear'],
    filterFields: ['student', 'category', 'status', 'academicYear', 'dueDate'],
    populate: studentRef,
    defaultSort: '-dueDate',
  }),
);

router.use(
  '/holidays',
  crudRouter({
    model: Holiday,
    schema: v.holidaySchema,
    searchFields: ['title'],
    filterFields: ['type', 'date'],
    defaultSort: 'date',
  }),
);

router.use(
  '/events',
  crudRouter({
    model: Event,
    schema: v.eventSchema,
    searchFields: ['title', 'venue', 'organizer'],
    filterFields: ['category', 'startDate'],
    defaultSort: 'startDate',
    afterCreate: async (_req, doc) => {
      const e = doc as { title: string; _id: unknown };
      await notificationService.toAudience('all', { title: 'New event', message: e.title, type: 'event', link: '/events' });
    },
  }),
);

router.use(
  '/circulars',
  crudRouter({
    model: Circular,
    schema: v.circularSchema,
    searchFields: ['title', 'content', 'referenceNo'],
    filterFields: ['audience', 'priority', 'department'],
    populate: [{ path: 'department', select: 'name code' }, { path: 'publishedBy', select: 'name' }],
    defaultSort: '-publishedAt',
    scope: audienceScope,
    beforeCreate: (req, data) => ({ ...data, publishedBy: req.user!.id }),
    afterCreate: async (_req, doc) => {
      const c = doc as { title: string; audience: 'all' | 'students' | 'faculty'; priority: string };
      await notificationService.toAudience(c.audience, {
        title: c.priority === 'urgent' ? 'Urgent circular' : 'New circular',
        message: c.title,
        type: 'circular',
        link: '/circulars',
      });
    },
  }),
);

router.use(
  '/documents',
  crudRouter({
    model: Document,
    schema: v.documentSchema,
    searchFields: ['title', 'description'],
    filterFields: ['category', 'owner', 'audience'],
    populate: [{ path: 'owner', select: 'name email' }, { path: 'uploadedBy', select: 'name' }],
    scope: (req) => {
      if (req.user!.role === 'admin') return {};
      const aud = req.user!.role === 'student' ? 'students' : 'faculty';
      return { $or: [{ owner: req.user!.id }, { owner: null, audience: { $in: ['all', aud] } }] };
    },
    beforeCreate: (req, data) => ({ ...data, uploadedBy: req.user!.id }),
    afterCreate: async (_req, doc) => {
      const d = doc as { title: string; owner?: { _id: string } };
      if (d.owner) {
        await notificationService.toUsers([d.owner._id], {
          title: 'New document available',
          message: d.title,
          type: 'info',
          link: '/student/documents',
        });
      }
    },
  }),
);

router.use(
  '/placements',
  crudRouter({
    model: Placement,
    schema: v.placementSchema,
    searchFields: ['company', 'jobRole', 'location'],
    filterFields: ['status', 'driveDate'],
    populate: [{ path: 'eligiblePrograms', select: 'code' }, { ...studentRef, path: 'selectedStudents' }],
    defaultSort: '-driveDate',
  }),
);

router.use(
  '/books',
  crudRouter({
    model: Book,
    schema: v.bookSchema,
    searchFields: ['title', 'author', 'isbn', 'category'],
    filterFields: ['category'],
    defaultSort: 'title',
  }),
);

router.use(
  '/book-issues',
  crudRouter({
    model: BookIssue,
    schema: v.bookIssueSchema,
    read: ['admin'],
    filterFields: ['book', 'student', 'status', 'dueDate'],
    populate: [{ path: 'book', select: 'title author' }, studentRef],
    defaultSort: '-issueDate',
    beforeCreate: async (_req, data) => {
      const book = await Book.findOneAndUpdate(
        { _id: data.book, availableCopies: { $gt: 0 } },
        { $inc: { availableCopies: -1 } },
      );
      if (!book) throw ApiError.badRequest('No copies of this book are available');
      return data;
    },
    afterUpdate: async (req, doc) => {
      const issue = doc as { book: { _id: unknown }; status: string };
      if (req.body.status === 'returned') {
        await Book.updateOne({ _id: issue.book._id }, { $inc: { availableCopies: 1 } });
      }
    },
  }),
);

router.use(
  '/hostels',
  crudRouter({
    model: Hostel,
    schema: v.hostelSchema,
    searchFields: ['name', 'warden'],
    filterFields: ['type'],
    defaultSort: 'name',
  }),
);

router.use(
  '/hostel-allocations',
  crudRouter({
    model: HostelAllocation,
    schema: v.hostelAllocationSchema,
    read: ['admin'],
    searchFields: ['roomNo'],
    filterFields: ['hostel', 'student', 'status'],
    populate: [{ path: 'hostel', select: 'name type' }, studentRef],
  }),
);

router.use(
  '/transport-routes',
  crudRouter({
    model: TransportRoute,
    schema: v.transportRouteSchema,
    searchFields: ['routeNo', 'name', 'vehicleNo', 'driverName'],
    defaultSort: 'routeNo',
  }),
);

// Read-only admin views over faculty-owned data.
router.use(
  '/attendance-sessions',
  crudRouter({
    model: AttendanceSession,
    schema: v.attendanceSchema,
    read: ['admin'],
    filterFields: ['course', 'section', 'faculty', 'date'],
    populate: [{ path: 'course', select: 'code title' }, { path: 'section', select: 'name' }, facultyRef],
    defaultSort: '-date',
  }),
);
router.use(
  '/assignments',
  crudRouter({
    model: Assignment,
    schema: v.assignmentSchema,
    read: ['admin'],
    searchFields: ['title'],
    filterFields: ['course', 'section', 'faculty', 'status'],
    populate: [{ path: 'course', select: 'code title' }, { path: 'section', select: 'name' }, facultyRef],
    defaultSort: '-dueDate',
  }),
);

export default router;
