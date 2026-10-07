import { Router } from 'express';
import { studentController as c } from '../controllers/student.controller.js';
import { authorize } from '../middleware/auth.js';
import { handleUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { payFeeSchema, profileUpdateSchema, submitAssignmentSchema } from '../validators/resources.js';

const router = Router();
router.use(authorize('student'));

router.get('/dashboard', c.dashboard);
router.get('/profile', c.profile);
router.patch('/profile', validate({ body: profileUpdateSchema }), c.updateProfile);
router.get('/courses', c.courses);
router.get('/attendance', c.attendance);
router.get('/attendance/:courseId', c.attendanceDetail);
router.get('/timetable', c.timetable);
router.get('/assignments', c.assignments);
router.get('/assignments/:id', validate({ params: idParam }), c.assignment);
router.post(
  '/assignments/:id/submit',
  validate({ params: idParam }),
  ...handleUpload('files', 5),
  validate({ body: submitAssignmentSchema }),
  c.submit,
);
router.get('/exams', c.exams);
router.get('/results', c.results);
router.get('/fees', c.fees);
router.post('/fees/:id/pay', validate({ params: idParam, body: payFeeSchema }), c.payFee);
router.get('/diary', c.diary);

export default router;
