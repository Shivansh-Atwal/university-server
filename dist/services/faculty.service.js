import mongoose from 'mongoose';
import { Course, Section, TimetableEntry } from '../models/academic.js';
import { LeaveRequest, Notification } from '../models/administration.js';
import { Assignment, AttendanceSession, Exam, Result, Submission } from '../models/coursework.js';
import { Faculty, Student } from '../models/people.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { gradeFor } from '../utils/grades.js';
import { paginated } from '../utils/query.js';
import { notificationService } from './notification.service.js';
import { todayName } from './student.service.js';
const dayRange = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
};
/** Throws unless the faculty member teaches `courseId` (and the section, when given). */
async function assertTeaches(facultyId, courseId, sectionId) {
    const filter = { _id: courseId, faculty: facultyId };
    if (sectionId)
        filter.sections = sectionId;
    if (!(await Course.exists(filter)))
        throw ApiError.forbidden('You are not assigned to this course/section');
}
async function sectionIdsFor(facultyId) {
    const courses = await Course.find({ faculty: facultyId }).select('sections').lean();
    const advised = await Section.find({ classAdvisor: facultyId }).select('_id').lean();
    return [...new Set([...courses.flatMap((c) => c.sections ?? []), ...advised.map((s) => s._id)].map(String))];
}
const rosterOf = (sectionId) => Student.find({ section: sectionId, status: 'active' })
    .select('enrollmentNo rollNo user')
    .populate('user', 'name avatar')
    .sort('rollNo enrollmentNo')
    .lean();
export const facultyPortalService = {
    async dashboard(facultyId, userId) {
        const courses = await Course.find({ faculty: facultyId }).select('_id sections').lean();
        const courseIds = courses.map((c) => c._id);
        const sectionIds = [...new Set(courses.flatMap((c) => (c.sections ?? []).map(String)))];
        const assignments = await Assignment.find({ faculty: facultyId }).select('_id').lean();
        const advisedSections = await Section.find({ classAdvisor: facultyId }).select('_id').lean();
        const advisedStudents = await Student.find({ section: { $in: advisedSections.map((s) => s._id) } })
            .select('_id')
            .lean();
        const [todayClasses, students, toGrade, pendingLeaves, upcomingExams, unread, markedToday] = await Promise.all([
            TimetableEntry.find({ faculty: facultyId, day: todayName() })
                .sort('startTime')
                .populate('course', 'code title')
                .populate({ path: 'section', select: 'name semesterNumber program', populate: { path: 'program', select: 'code' } })
                .lean(),
            Student.countDocuments({ section: { $in: sectionIds }, status: 'active' }),
            Submission.countDocuments({ assignment: { $in: assignments.map((a) => a._id) }, status: { $in: ['submitted', 'late'] } }),
            LeaveRequest.countDocuments({ student: { $in: advisedStudents.map((s) => s._id) }, status: 'pending' }),
            Exam.find({ course: { $in: courseIds }, date: { $gte: dayRange(new Date()).start } })
                .sort('date')
                .limit(4)
                .populate('course', 'code title')
                .populate('section', 'name')
                .lean(),
            Notification.countDocuments({ user: userId, read: false }),
            AttendanceSession.find({ faculty: facultyId, date: { $gte: dayRange(new Date()).start, $lt: dayRange(new Date()).end } })
                .select('course section startTime')
                .lean(),
        ]);
        return {
            todayClasses: todayClasses.map((c) => ({
                ...c,
                attendanceMarked: markedToday.some((m) => String(m.course) === String(c.course?._id) &&
                    String(m.section) === String(c.section?._id) &&
                    m.startTime === c.startTime),
            })),
            stats: {
                courses: courses.length,
                sections: sectionIds.length,
                students,
                toGrade,
                pendingLeaves,
                unreadNotifications: unread,
            },
            upcomingExams,
        };
    },
    async updateProfile(facultyId, userId, data) {
        const profile = {};
        for (const k of ['qualification', 'specialization', 'officeRoom'])
            if (data[k] !== undefined)
                profile[k] = data[k];
        if (Object.keys(profile).length)
            await Faculty.updateOne({ _id: facultyId }, { $set: profile });
        const user = {};
        for (const k of ['phone', 'avatar'])
            if (data[k] !== undefined)
                user[k] = data[k];
        if (Object.keys(user).length)
            await User.updateOne({ _id: userId }, { $set: user });
    },
    async courses(facultyId) {
        const courses = await Course.find({ faculty: facultyId })
            .sort('code')
            .populate('department', 'name code')
            .populate('program', 'name code')
            .populate({ path: 'sections', select: 'name semesterNumber program room', populate: { path: 'program', select: 'code' } })
            .lean();
        const sectionIds = courses.flatMap((c) => (c.sections ?? []).map((s) => s._id));
        const counts = await Student.aggregate([
            { $match: { section: { $in: sectionIds }, status: 'active' } },
            { $group: { _id: '$section', n: { $sum: 1 } } },
        ]);
        const countMap = new Map(counts.map((c) => [String(c._id), c.n]));
        return courses.map((c) => ({
            ...c,
            sections: (c.sections ?? []).map((s) => {
                const sec = s;
                return { ...sec, studentCount: countMap.get(String(sec._id)) ?? 0 };
            }),
        }));
    },
    async sectionStudents(facultyId, sectionId, opts) {
        const allowed = await sectionIdsFor(facultyId);
        if (!allowed.includes(sectionId))
            throw ApiError.forbidden('You do not teach this section');
        const filter = { section: sectionId };
        if (opts.search) {
            const rx = new RegExp(opts.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            const users = await User.find({ role: 'student', name: rx }).select('_id').lean();
            filter.$or = [{ enrollmentNo: rx }, { rollNo: rx }, { user: { $in: users.map((u) => u._id) } }];
        }
        const [items, total] = await Promise.all([
            Student.find(filter)
                .sort('rollNo enrollmentNo')
                .skip(opts.skip)
                .limit(opts.limit)
                .populate('user', 'name email phone avatar')
                .populate('program', 'code name')
                .lean(),
            Student.countDocuments(filter),
        ]);
        return paginated(items, total, opts);
    },
    async timetable(facultyId) {
        return TimetableEntry.find({ faculty: facultyId })
            .sort('startTime')
            .populate('course', 'code title type')
            .populate({ path: 'section', select: 'name semesterNumber program', populate: { path: 'program', select: 'code' } })
            .lean();
    },
    /** Returns the saved session for the slot, or a fresh roster defaulting everyone to present. */
    async attendanceSheet(facultyId, courseId, sectionId, date, startTime = '09:00') {
        await assertTeaches(facultyId, courseId, sectionId);
        const { start, end } = dayRange(date);
        const [session, roster] = await Promise.all([
            AttendanceSession.findOne({ course: courseId, section: sectionId, date: { $gte: start, $lt: end }, startTime }).lean(),
            rosterOf(sectionId),
        ]);
        const statusMap = new Map((session?.records ?? []).map((r) => [String(r.student), r.status]));
        return {
            sessionId: session?._id ?? null,
            topic: session?.topic ?? '',
            saved: Boolean(session),
            students: roster.map((s) => ({ ...s, status: statusMap.get(String(s._id)) ?? 'present' })),
        };
    },
    async saveAttendance(facultyId, data) {
        await assertTeaches(facultyId, data.course, data.section);
        const { start } = dayRange(data.date);
        const startTime = data.startTime ?? '09:00';
        const session = await AttendanceSession.findOneAndUpdate({ course: data.course, section: data.section, date: start, startTime }, { faculty: facultyId, topic: data.topic, records: data.records }, { upsert: true, returnDocument: 'after', runValidators: true }).lean();
        const absentees = data.records.filter((r) => r.status === 'absent').map((r) => r.student);
        if (absentees.length) {
            const course = await Course.findById(data.course).select('code').lean();
            await notificationService.toStudents(absentees, {
                title: 'Marked absent',
                message: `You were marked absent in ${course?.code ?? 'a class'} on ${start.toDateString()}.`,
                type: 'attendance',
                link: '/student/attendance',
            });
        }
        return session;
    },
    async attendanceSessions(facultyId, query, opts) {
        const filter = { faculty: facultyId };
        if (query.course)
            filter.course = query.course;
        if (query.section)
            filter.section = query.section;
        const [sessions, total] = await Promise.all([
            AttendanceSession.find(filter)
                .sort('-date -startTime')
                .skip(opts.skip)
                .limit(opts.limit)
                .populate('course', 'code title')
                .populate('section', 'name')
                .lean(),
            AttendanceSession.countDocuments(filter),
        ]);
        const items = sessions.map(({ records, ...s }) => ({
            ...s,
            total: records.length,
            present: records.filter((r) => r.status === 'present' || r.status === 'late').length,
        }));
        return paginated(items, total, opts);
    },
    async submissions(facultyId, assignmentId) {
        const assignment = await Assignment.findOne({ _id: assignmentId, faculty: facultyId })
            .populate('course', 'code title')
            .populate('section', 'name')
            .lean();
        if (!assignment)
            throw ApiError.notFound('Assignment not found');
        const sectionId = assignment.section._id;
        const [roster, subs] = await Promise.all([rosterOf(sectionId), Submission.find({ assignment: assignmentId }).lean()]);
        const subMap = new Map(subs.map((s) => [String(s.student), s]));
        return {
            assignment,
            students: roster.map((s) => ({ student: s, submission: subMap.get(String(s._id)) ?? null })),
            stats: {
                total: roster.length,
                submitted: subs.length,
                graded: subs.filter((s) => s.status === 'graded').length,
            },
        };
    },
    async gradeSubmission(facultyId, submissionId, marks, feedback) {
        const sub = await Submission.findById(submissionId);
        if (!sub)
            throw ApiError.notFound('Submission not found');
        const assignment = await Assignment.findOne({ _id: sub.assignment, faculty: facultyId }).lean();
        if (!assignment)
            throw ApiError.forbidden();
        if (marks > (assignment.maxMarks ?? 0)) {
            throw ApiError.badRequest(`Marks cannot exceed ${assignment.maxMarks}`, { marks: `Max ${assignment.maxMarks}` });
        }
        Object.assign(sub, { marks, feedback, status: 'graded', gradedAt: new Date() });
        await sub.save();
        await notificationService.toStudents([sub.student], {
            title: 'Assignment graded',
            message: `"${assignment.title}" was graded: ${marks}/${assignment.maxMarks}.`,
            type: 'assignment',
            link: `/student/assignments/${assignment._id}`,
        });
        return sub.toObject();
    },
    async exams(facultyId) {
        const courses = await Course.find({ faculty: facultyId }).select('_id').lean();
        return Exam.find({ course: { $in: courses.map((c) => c._id) } })
            .sort('-date')
            .populate('course', 'code title')
            .populate('section', 'name')
            .lean();
    },
    async marksSheet(facultyId, examId) {
        const exam = await Exam.findById(examId).populate('course', 'code title sections').populate('section', 'name').lean();
        if (!exam)
            throw ApiError.notFound('Exam not found');
        const course = exam.course;
        await assertTeaches(facultyId, course._id);
        const sectionIds = exam.section ? [exam.section._id] : course.sections;
        const [students, results] = await Promise.all([
            Student.find({ section: { $in: sectionIds }, status: 'active' })
                .select('enrollmentNo rollNo user section')
                .populate('user', 'name')
                .populate('section', 'name')
                .sort('rollNo enrollmentNo')
                .lean(),
            Result.find({ exam: examId }).lean(),
        ]);
        const map = new Map(results.map((r) => [String(r.student), r]));
        return { exam, students: students.map((s) => ({ student: s, result: map.get(String(s._id)) ?? null })) };
    },
    async uploadMarks(facultyId, userId, examId, marks) {
        const exam = await Exam.findById(examId).lean();
        if (!exam)
            throw ApiError.notFound('Exam not found');
        await assertTeaches(facultyId, exam.course);
        const max = exam.maxMarks ?? 100;
        const over = marks.find((m) => m.marksObtained > max);
        if (over)
            throw ApiError.badRequest(`Marks cannot exceed ${max}`);
        await Result.bulkWrite(marks.map((m) => {
            const obtained = m.isAbsent ? 0 : m.marksObtained;
            const percentage = Math.round((obtained / max) * 1000) / 10;
            const band = gradeFor(percentage);
            return {
                updateOne: {
                    filter: { exam: new mongoose.Types.ObjectId(examId), student: new mongoose.Types.ObjectId(m.student) },
                    update: {
                        $set: {
                            course: exam.course,
                            marksObtained: obtained,
                            maxMarks: max,
                            percentage,
                            grade: m.isAbsent ? 'AB' : band.grade,
                            gradePoints: m.isAbsent ? 0 : band.points,
                            isAbsent: Boolean(m.isAbsent),
                            remarks: m.remarks,
                            enteredBy: new mongoose.Types.ObjectId(userId),
                        },
                    },
                    upsert: true,
                },
            };
        }));
        return { saved: marks.length };
    },
    async leaveReviews(facultyId, status, opts) {
        const sections = await Section.find({ classAdvisor: facultyId }).select('_id').lean();
        const students = await Student.find({ section: { $in: sections.map((s) => s._id) } }).select('_id').lean();
        const filter = { student: { $in: students.map((s) => s._id) } };
        if (status)
            filter.status = status;
        const [items, total] = await Promise.all([
            LeaveRequest.find(filter)
                .sort('-createdAt')
                .skip(opts.skip)
                .limit(opts.limit)
                .populate('requester', 'name email avatar')
                .populate({ path: 'student', select: 'enrollmentNo section', populate: { path: 'section', select: 'name' } })
                .lean(),
            LeaveRequest.countDocuments(filter),
        ]);
        return paginated(items, total, opts);
    },
    async reviewStudentLeave(facultyId, userId, leaveId, status, remarks) {
        const leave = await LeaveRequest.findById(leaveId);
        if (!leave || !leave.student)
            throw ApiError.notFound('Leave request not found');
        const student = await Student.findById(leave.student).select('section').lean();
        const advised = await Section.exists({ _id: student?.section, classAdvisor: facultyId });
        if (!advised)
            throw ApiError.forbidden('Only the class advisor can review this request');
        return reviewLeave(leave, userId, status, remarks);
    },
};
/** Shared by faculty (student leaves) and admin (any leave). */
export async function reviewLeave(leave, reviewerId, status, remarks) {
    if (leave.status !== 'pending')
        throw ApiError.badRequest('This request has already been processed');
    leave.status = status;
    leave.reviewRemarks = remarks;
    leave.reviewedBy = new mongoose.Types.ObjectId(reviewerId);
    leave.reviewedAt = new Date();
    await leave.save();
    await notificationService.toUsers([leave.requester], {
        title: `Leave ${status}`,
        message: `Your ${leave.type} leave request was ${status}.${remarks ? ` Remarks: ${remarks}` : ''}`,
        type: 'leave',
        link: leave.role === 'student' ? '/student/leaves' : '/faculty/leaves',
    });
    return leave.toObject();
}
//# sourceMappingURL=faculty.service.js.map