import type { Request, Response } from 'express';
import { requireProfile } from '../middleware/auth.js';
import { authService } from '../services/auth.service.js';
import { facultyPortalService as svc } from '../services/faculty.service.js';
import { ApiError } from '../utils/ApiError.js';
import { parseListOptions } from '../utils/query.js';

export const facultyController = {
  dashboard: async (req: Request, res: Response) => {
    res.json(await svc.dashboard(requireProfile(req), req.user!.id));
  },
  updateProfile: async (req: Request, res: Response) => {
    await svc.updateProfile(requireProfile(req), req.user!.id, req.body);
    res.json(await authService.me(req.user!.id));
  },
  courses: async (req: Request, res: Response) => {
    res.json(await svc.courses(requireProfile(req)));
  },
  sectionStudents: async (req: Request, res: Response) => {
    res.json(await svc.sectionStudents(requireProfile(req), String(req.params.sectionId), parseListOptions(req, 'rollNo')));
  },
  timetable: async (req: Request, res: Response) => {
    res.json(await svc.timetable(requireProfile(req)));
  },
  attendanceSheet: async (req: Request, res: Response) => {
    const { course, section, date, startTime } = req.query as Record<string, string | undefined>;
    if (!course || !section) throw ApiError.badRequest('course and section are required');
    res.json(await svc.attendanceSheet(requireProfile(req), course, section, date ? new Date(date) : new Date(), startTime));
  },
  saveAttendance: async (req: Request, res: Response) => {
    res.json(await svc.saveAttendance(requireProfile(req), req.body));
  },
  attendanceSessions: async (req: Request, res: Response) => {
    res.json(await svc.attendanceSessions(requireProfile(req), req.query, parseListOptions(req)));
  },
  submissions: async (req: Request, res: Response) => {
    res.json(await svc.submissions(requireProfile(req), String(req.params.id)));
  },
  grade: async (req: Request, res: Response) => {
    res.json(await svc.gradeSubmission(requireProfile(req), String(req.params.id), req.body.marks, req.body.feedback));
  },
  exams: async (req: Request, res: Response) => {
    res.json(await svc.exams(requireProfile(req)));
  },
  marksSheet: async (req: Request, res: Response) => {
    res.json(await svc.marksSheet(requireProfile(req), String(req.params.id)));
  },
  uploadMarks: async (req: Request, res: Response) => {
    res.json(await svc.uploadMarks(requireProfile(req), req.user!.id, String(req.params.id), req.body.marks));
  },
  leaveReviews: async (req: Request, res: Response) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    res.json(await svc.leaveReviews(requireProfile(req), status, parseListOptions(req)));
  },
  reviewLeave: async (req: Request, res: Response) => {
    res.json(
      await svc.reviewStudentLeave(requireProfile(req), req.user!.id, String(req.params.id), req.body.status, req.body.reviewRemarks),
    );
  },
};
