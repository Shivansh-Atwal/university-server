import type { Types } from 'mongoose';
import { Notification } from '../models/administration.js';
import { Student } from '../models/people.js';
import { User, type Role } from '../models/User.js';

type Id = string | Types.ObjectId;

export interface NotificationPayload {
  title: string;
  message?: string;
  type?: string;
  link?: string;
}

export const notificationService = {
  async toUsers(userIds: Id[], payload: NotificationPayload) {
    if (!userIds.length) return;
    await Notification.insertMany(userIds.map((user) => ({ user, ...payload })), { ordered: false });
  },

  async toAudience(audience: 'all' | 'students' | 'faculty', payload: NotificationPayload) {
    const roles: Role[] = audience === 'all' ? ['student', 'faculty'] : [audience === 'students' ? 'student' : 'faculty'];
    const users = await User.find({ role: { $in: roles }, isActive: true }).select('_id').lean();
    await this.toUsers(users.map((u) => u._id), payload);
  },

  async toSection(sectionId: Id, payload: NotificationPayload) {
    const students = await Student.find({ section: sectionId, status: 'active' }).select('user').lean();
    await this.toUsers(students.map((s) => s.user), payload);
  },

  async toStudents(studentIds: Id[], payload: NotificationPayload) {
    const students = await Student.find({ _id: { $in: studentIds } }).select('user').lean();
    await this.toUsers(students.map((s) => s.user), payload);
  },
};
