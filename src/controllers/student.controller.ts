import type { Request, Response } from 'express';
import { requireProfile } from '../middleware/auth.js';
import { studentPortalService as svc } from '../services/student.service.js';
import { authService } from '../services/auth.service.js';
import { parseListOptions } from '../utils/query.js';

const q = (req: Request, key: string) => (req.query[key] ? String(req.query[key]) : undefined);

export const studentController = {
  dashboard: async (req: Request, res: Response) => {
    res.json(await svc.dashboard(requireProfile(req), req.user!.id));
  },
  profile: async (req: Request, res: Response) => {
    res.json(await authService.me(req.user!.id));
  },
  updateProfile: async (req: Request, res: Response) => {
    await svc.updateProfile(requireProfile(req), req.user!.id, req.body);
    res.json(await authService.me(req.user!.id));
  },
  courses: async (req: Request, res: Response) => {
    res.json(await svc.courses(requireProfile(req)));
  },
  attendance: async (req: Request, res: Response) => {
    res.json(await svc.attendanceSummary(requireProfile(req)));
  },
  attendanceDetail: async (req: Request, res: Response) => {
    res.json(await svc.attendanceDetail(requireProfile(req), String(req.params.courseId), parseListOptions(req)));
  },
  timetable: async (req: Request, res: Response) => {
    res.json(await svc.timetable(requireProfile(req)));
  },
  assignments: async (req: Request, res: Response) => {
    res.json(await svc.assignments(requireProfile(req), q(req, 'status'), parseListOptions(req)));
  },
  assignment: async (req: Request, res: Response) => {
    res.json(await svc.assignment(requireProfile(req), String(req.params.id)));
  },
  submit: async (req: Request, res: Response) => {
    const files = [...(res.locals.files ?? []), ...(req.body.files ?? [])];
    res.status(201).json(await svc.submitAssignment(requireProfile(req), String(req.params.id), req.body.text, files));
  },
  exams: async (req: Request, res: Response) => {
    res.json(await svc.exams(requireProfile(req), q(req, 'when')));
  },
  results: async (req: Request, res: Response) => {
    res.json(await svc.results(requireProfile(req)));
  },
  fees: async (req: Request, res: Response) => {
    res.json(await svc.fees(requireProfile(req)));
  },
  payFee: async (req: Request, res: Response) => {
    res.json(await svc.payFee(requireProfile(req), String(req.params.id), req.body.amount, req.body.method));
  },
  diary: async (req: Request, res: Response) => {
    res.json(await svc.diary(requireProfile(req), q(req, 'course'), parseListOptions(req, '-date')));
  },
};
