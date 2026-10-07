import { Router, type Request } from 'express';
import { facultyController as c } from '../controllers/faculty.controller.js';
import { authorize, requireProfile } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Course } from '../models/academic.js';
import { Assignment, DiaryEntry } from '../models/coursework.js';
import { ApiError } from '../utils/ApiError.js';
import { idParam, objectId } from '../validators/common.js';
import {
  assignmentSchema,
  attendanceSchema,
  diarySchema,
  gradeSubmissionSchema,
  marksUploadSchema,
  profileUpdateSchema,
  reviewLeaveSchema,
} from '../validators/resources.js';
import { notificationService } from '../services/notification.service.js';
import { crudRouter } from './crud.routes.js';
import { z } from 'zod';

const router = Router();
router.use(authorize('faculty'));

const ownScope = (req: Request) => ({ faculty: requireProfile(req) });

/** Creating course content requires teaching that course in that section. */
async function withOwnership(req: Request, data: Record<string, unknown>) {
  const faculty = requireProfile(req);
  const ok = await Course.exists({ _id: String(data.course), faculty, sections: String(data.section) });
  if (!ok) throw ApiError.forbidden('You are not assigned to this course/section');
  return { ...data, faculty };
}

router.get('/dashboard', c.dashboard);
router.patch('/profile', validate({ body: profileUpdateSchema }), c.updateProfile);
router.get('/courses', c.courses);
router.get('/sections/:sectionId/students', validate({ params: z.object({ sectionId: objectId }) }), c.sectionStudents);
router.get('/timetable', c.timetable);

router.get('/attendance/sheet', c.attendanceSheet);
router.get('/attendance/sessions', c.attendanceSessions);
router.post('/attendance', validate({ body: attendanceSchema }), c.saveAttendance);

router.use(
  '/assignments',
  crudRouter({
    model: Assignment,
    schema: assignmentSchema,
    read: ['faculty'],
    write: ['faculty'],
    searchFields: ['title'],
    filterFields: ['course', 'section', 'status'],
    populate: [
      { path: 'course', select: 'code title' },
      { path: 'section', select: 'name' },
    ],
    defaultSort: '-dueDate',
    scope: ownScope,
    beforeCreate: withOwnership,
    afterCreate: async (_req, doc) => {
      const a = doc as { _id: unknown; title: string; status: string; section: { _id: string }; course: { code: string } };
      if (a.status !== 'published') return;
      await notificationService.toSection(a.section._id, {
        title: 'New assignment',
        message: `${a.course.code}: ${a.title}`,
        type: 'assignment',
        link: `/student/assignments/${a._id}`,
      });
    },
  }),
);
router.get('/assignments/:id/submissions', validate({ params: idParam }), c.submissions);
router.patch('/submissions/:id/grade', validate({ params: idParam, body: gradeSubmissionSchema }), c.grade);

router.use(
  '/diary',
  crudRouter({
    model: DiaryEntry,
    schema: diarySchema,
    read: ['faculty'],
    write: ['faculty'],
    searchFields: ['topic', 'description'],
    filterFields: ['course', 'section', 'date'],
    populate: [
      { path: 'course', select: 'code title' },
      { path: 'section', select: 'name' },
    ],
    defaultSort: '-date',
    scope: ownScope,
    beforeCreate: withOwnership,
  }),
);

router.get('/exams', c.exams);
router.get('/exams/:id/marks', validate({ params: idParam }), c.marksSheet);
router.put('/exams/:id/marks', validate({ params: idParam, body: marksUploadSchema }), c.uploadMarks);

router.get('/leave-reviews', c.leaveReviews);
router.patch('/leave-reviews/:id', validate({ params: idParam, body: reviewLeaveSchema }), c.reviewLeave);

export default router;
