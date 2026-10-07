import { Notification } from '../models/administration.js';
import { Student } from '../models/people.js';
import { User } from '../models/User.js';
export const notificationService = {
    async toUsers(userIds, payload) {
        if (!userIds.length)
            return;
        await Notification.insertMany(userIds.map((user) => ({ user, ...payload })), { ordered: false });
    },
    async toAudience(audience, payload) {
        const roles = audience === 'all' ? ['student', 'faculty'] : [audience === 'students' ? 'student' : 'faculty'];
        const users = await User.find({ role: { $in: roles }, isActive: true }).select('_id').lean();
        await this.toUsers(users.map((u) => u._id), payload);
    },
    async toSection(sectionId, payload) {
        const students = await Student.find({ section: sectionId, status: 'active' }).select('user').lean();
        await this.toUsers(students.map((s) => s.user), payload);
    },
    async toStudents(studentIds, payload) {
        const students = await Student.find({ _id: { $in: studentIds } }).select('user').lean();
        await this.toUsers(students.map((s) => s.user), payload);
    },
};
//# sourceMappingURL=notification.service.js.map