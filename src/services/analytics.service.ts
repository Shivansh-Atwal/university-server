import { Course, Department, Program } from '../models/academic.js';
import { Event, Fee, LeaveRequest, Placement, UniversityRequest } from '../models/administration.js';
import { AttendanceSession, Result } from '../models/coursework.js';
import { Faculty, Student } from '../models/people.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const analyticsService = {
  async overview() {
    const since = new Date();
    since.setDate(since.getDate() - 7 * 12);
    since.setHours(0, 0, 0, 0);
    const yearAgo = new Date();
    yearAgo.setMonth(yearAgo.getMonth() - 11, 1);
    yearAgo.setHours(0, 0, 0, 0);

    const [
      students,
      activeStudents,
      faculty,
      departments,
      programs,
      courses,
      pendingLeaves,
      openRequests,
      upcomingEvents,
      byDepartment,
      byStatus,
      attendanceTrend,
      feeTotals,
      feeByMonth,
      feeByCategory,
      examByCourse,
      gradeDistribution,
      placementStats,
      placementByCompany,
    ] = await Promise.all([
      Student.countDocuments(),
      Student.countDocuments({ status: 'active' }),
      Faculty.countDocuments(),
      Department.countDocuments(),
      Program.countDocuments(),
      Course.countDocuments(),
      LeaveRequest.countDocuments({ status: 'pending' }),
      UniversityRequest.countDocuments({ status: { $in: ['open', 'in-progress'] } }),
      Event.countDocuments({ startDate: { $gte: new Date() } }),

      Student.aggregate([
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } },
        { $project: { _id: 0, name: { $ifNull: [{ $first: '$d.code' }, 'N/A'] }, count: 1 } },
        { $sort: { count: -1 } },
      ]),
      Student.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $project: { _id: 0, status: '$_id', count: 1 } }]),

      // Weekly attendance %, last 12 weeks.
      AttendanceSession.aggregate([
        { $match: { date: { $gte: since } } },
        { $unwind: '$records' },
        {
          $group: {
            _id: { $dateTrunc: { date: '$date', unit: 'week', startOfWeek: 'monday' } },
            total: { $sum: 1 },
            attended: { $sum: { $cond: [{ $in: ['$records.status', ['present', 'late']] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            week: '$_id',
            percentage: { $round: [{ $multiply: [{ $divide: ['$attended', '$total'] }, 100] }, 1] },
          },
        },
      ]),

      Fee.aggregate([
        {
          $group: {
            _id: null,
            billed: { $sum: '$amount' },
            collected: { $sum: '$paidAmount' },
          },
        },
      ]),
      Fee.aggregate([
        { $unwind: '$payments' },
        { $match: { 'payments.paidAt': { $gte: yearAgo } } },
        {
          $group: {
            _id: { y: { $year: '$payments.paidAt' }, m: { $month: '$payments.paidAt' } },
            amount: { $sum: '$payments.amount' },
          },
        },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
      ]),
      Fee.aggregate([
        { $group: { _id: '$category', billed: { $sum: '$amount' }, collected: { $sum: '$paidAmount' } } },
        { $project: { _id: 0, category: '$_id', billed: 1, collected: 1 } },
        { $sort: { billed: -1 } },
      ]),

      Result.aggregate([
        {
          $group: {
            _id: '$course',
            average: { $avg: '$percentage' },
            passed: { $sum: { $cond: [{ $gte: ['$percentage', 40] }, 1, 0] } },
            total: { $sum: 1 },
          },
        },
        { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'c' } },
        {
          $project: {
            _id: 0,
            course: { $first: '$c.code' },
            average: { $round: ['$average', 1] },
            passRate: { $round: [{ $multiply: [{ $divide: ['$passed', '$total'] }, 100] }, 1] },
          },
        },
        { $sort: { average: -1 } },
        { $limit: 10 },
      ]),
      Result.aggregate([
        { $group: { _id: '$grade', count: { $sum: 1 } } },
        { $project: { _id: 0, grade: '$_id', count: 1 } },
      ]),

      Placement.aggregate([
        {
          $group: {
            _id: null,
            drives: { $sum: 1 },
            placed: { $sum: { $size: { $ifNull: ['$selectedStudents', []] } } },
            highest: { $max: { $cond: [{ $gt: [{ $size: { $ifNull: ['$selectedStudents', []] } }, 0] }, '$packageLPA', null] } },
            weighted: { $sum: { $multiply: ['$packageLPA', { $size: { $ifNull: ['$selectedStudents', []] } }] } },
          },
        },
      ]),
      Placement.aggregate([
        { $project: { company: 1, packageLPA: 1, placed: { $size: { $ifNull: ['$selectedStudents', []] } } } },
        { $match: { placed: { $gt: 0 } } },
        { $sort: { placed: -1 } },
        { $limit: 8 },
        { $project: { _id: 0, company: 1, packageLPA: 1, placed: 1 } },
      ]),
    ]);

    // Fill every month of the last year so the chart has no gaps.
    const feeCollection = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(yearAgo);
      d.setMonth(yearAgo.getMonth() + i);
      const hit = feeByMonth.find((r) => r._id.y === d.getFullYear() && r._id.m === d.getMonth() + 1);
      return { month: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, amount: hit?.amount ?? 0 };
    });

    const gradeOrder = ['O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F', 'AB'];
    const p = placementStats[0] ?? { drives: 0, placed: 0, highest: 0, weighted: 0 };
    const fees = feeTotals[0] ?? { billed: 0, collected: 0 };
    const avgAttendance = attendanceTrend.length
      ? Math.round((attendanceTrend.reduce((s, w) => s + w.percentage, 0) / attendanceTrend.length) * 10) / 10
      : 0;

    return {
      counts: { students, activeStudents, faculty, departments, programs, courses, pendingLeaves, openRequests, upcomingEvents },
      students: { byDepartment, byStatus },
      attendance: { average: avgAttendance, trend: attendanceTrend },
      fees: {
        billed: fees.billed,
        collected: fees.collected,
        outstanding: fees.billed - fees.collected,
        collectionRate: fees.billed ? Math.round((fees.collected / fees.billed) * 1000) / 10 : 0,
        byMonth: feeCollection,
        byCategory: feeByCategory,
      },
      exams: {
        byCourse: examByCourse,
        gradeDistribution: gradeDistribution.sort((a, b) => gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade)),
      },
      placements: {
        drives: p.drives,
        placed: p.placed,
        highestPackage: p.highest ?? 0,
        averagePackage: p.placed ? Math.round((p.weighted / p.placed) * 100) / 100 : 0,
        byCompany: placementByCompany,
      },
    };
  },
};
