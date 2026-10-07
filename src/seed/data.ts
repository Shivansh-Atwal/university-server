import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  AttendanceSession,
  Assignment,
  Book,
  BookIssue,
  Circular,
  Course,
  DAYS,
  Department,
  DiaryEntry,
  Document,
  Event,
  Exam,
  Faculty,
  Fee,
  Holiday,
  Hostel,
  HostelAllocation,
  LeaveRequest,
  Notification,
  Placement,
  Program,
  RefreshToken,
  Result,
  Section,
  Semester,
  Settings,
  Student,
  Submission,
  TimetableEntry,
  TransportRoute,
  UniversityRequest,
  User,
} from '../models/index.js';
import { UPLOAD_DIR } from '../middleware/upload.js';
import { gradeFor } from '../utils/grades.js';

type Id = mongoose.Types.ObjectId;
const newId = () => new mongoose.Types.ObjectId();

// Deterministic PRNG so every seed produces the same data.
let state = 20260929;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

const FIRST = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
  'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Pari', 'Myra', 'Aarohi', 'Anika', 'Navya', 'Kiara',
  'Rohan', 'Kabir', 'Dhruv', 'Nikhil', 'Rahul', 'Priya', 'Sneha', 'Meera', 'Tanvi', 'Riya',
  'Harsh', 'Yash', 'Kunal', 'Neha', 'Pooja', 'Aditi', 'Siddharth', 'Varun', 'Isha', 'Shreya',
];
const LAST = [
  'Sharma', 'Verma', 'Gupta', 'Iyer', 'Reddy', 'Nair', 'Patel', 'Singh', 'Kumar', 'Menon',
  'Joshi', 'Mehta', 'Rao', 'Das', 'Chopra', 'Kapoor', 'Malhotra', 'Bose', 'Pillai', 'Kulkarni',
];
const CITIES = ['Bengaluru', 'Pune', 'Hyderabad', 'Chennai', 'Delhi', 'Mumbai', 'Kochi', 'Jaipur'];

const day = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Writes a tiny single-page PDF so seeded documents are real downloadable files. */
function writePdf(filename: string, title: string, lines: string[]) {
  const text = [title, '', ...lines]
    .map((l, i) => `BT /F1 ${i === 0 ? 18 : 11} Tf 60 ${760 - i * 22} Td (${l.replace(/[()\\]/g, '')}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), pdf);
  return { name: filename, url: `/uploads/${filename}`, size: pdf.length, mimeType: 'application/pdf' };
}

export async function seedDatabase() {
  const t0 = Date.now();
  const models = [
    AttendanceSession, Assignment, Book, BookIssue, Circular, Course, Department, DiaryEntry, Document, Event,
    Exam, Faculty, Fee, Holiday, Hostel, HostelAllocation, LeaveRequest, Notification, Placement, Program,
    RefreshToken, Result, Section, Semester, Settings, Student, Submission, TimetableEntry, TransportRoute,
    UniversityRequest, User,
  ];
  await Promise.all(models.map((m) => (m as typeof User).deleteMany({})));
  await Promise.all(models.map((m) => (m as typeof User).syncIndexes()));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const termStart = day(2026, 7, 15);

  // ---------- terms & settings ----------
  const [currentTerm] = await Semester.insertMany([
    { name: 'Odd Semester 2026-27', academicYear: '2026-27', type: 'odd', startDate: termStart, endDate: day(2026, 12, 15), isCurrent: true },
    { name: 'Even Semester 2025-26', academicYear: '2025-26', type: 'even', startDate: day(2026, 1, 5), endDate: day(2026, 5, 30) },
    { name: 'Odd Semester 2025-26', academicYear: '2025-26', type: 'odd', startDate: day(2025, 7, 14), endDate: day(2025, 12, 12) },
  ]);
  const prevTerm = (await Semester.findOne({ name: 'Even Semester 2025-26' }))!;

  await Settings.create({
    key: 'global',
    universityName: 'Northbridge University',
    shortName: 'NBU',
    address: '12 University Avenue, Knowledge Park, Bengaluru 560100',
    email: 'info@northbridge.edu',
    phone: '+91 80 4000 1000',
    website: 'https://northbridge.edu',
    currentAcademicYear: '2026-27',
    currentSemester: currentTerm._id,
  });

  // ---------- users ----------
  const [adminHash, facultyHash, studentHash] = await Promise.all([
    bcrypt.hash('Admin@123', 10),
    bcrypt.hash('Faculty@123', 10),
    bcrypt.hash('Student@123', 10),
  ]);
  const usedEmails = new Set<string>();
  const emailFor = (first: string, last: string, domain: string) => {
    let base = `${first}.${last}`.toLowerCase();
    let e = `${base}@${domain}`;
    let n = 1;
    while (usedEmails.has(e)) e = `${base}${n++}@${domain}`;
    usedEmails.add(e);
    return e;
  };

  const admin = await User.collection.insertOne({
    name: 'Anita Deshpande',
    email: 'admin@university.edu',
    password: adminHash,
    role: 'admin',
    phone: '+91 98450 00001',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const adminId = admin.insertedId;
  usedEmails.add('admin@university.edu');

  // ---------- departments, programs ----------
  const deptDefs = [
    { name: 'Computer Science & Engineering', code: 'CSE', established: 1998 },
    { name: 'Electronics & Communication Engineering', code: 'ECE', established: 1998 },
    { name: 'Mechanical Engineering', code: 'ME', established: 2001 },
    { name: 'School of Business', code: 'SOB', established: 2005 },
  ];
  const departments = await Department.insertMany(
    deptDefs.map((d) => ({ ...d, description: `Department of ${d.name}` })),
  );
  const deptBy = Object.fromEntries(departments.map((d) => [d.code, d]));

  const programs = await Program.insertMany([
    { name: 'B.Tech Computer Science & Engineering', code: 'BTCSE', department: deptBy.CSE._id, degree: 'UG', durationYears: 4, totalSemesters: 8, intake: 120 },
    { name: 'B.Tech Electronics & Communication', code: 'BTECE', department: deptBy.ECE._id, degree: 'UG', durationYears: 4, totalSemesters: 8, intake: 60 },
    { name: 'B.Tech Mechanical Engineering', code: 'BTME', department: deptBy.ME._id, degree: 'UG', durationYears: 4, totalSemesters: 8, intake: 60 },
    { name: 'Master of Business Administration', code: 'MBA', department: deptBy.SOB._id, degree: 'PG', durationYears: 2, totalSemesters: 4, intake: 60 },
  ]);
  const progBy = Object.fromEntries(programs.map((p) => [p.code, p]));

  // ---------- faculty ----------
  const designations = ['Professor', 'Associate Professor', 'Assistant Professor', 'Assistant Professor'] as const;
  const specs: Record<string, string[]> = {
    CSE: ['Machine Learning', 'Distributed Systems', 'Databases', 'Computer Networks', 'Algorithms'],
    ECE: ['VLSI Design', 'Signal Processing', 'Embedded Systems', 'Communication Systems'],
    ME: ['Thermodynamics', 'Manufacturing', 'Fluid Mechanics', 'Robotics'],
    SOB: ['Finance', 'Marketing', 'Operations', 'Human Resources'],
  };
  const facultyByDept: Record<string, { _id: Id; user: Id }[]> = {};
  let empNo = 1001;
  for (const d of departments) {
    const count = d.code === 'CSE' ? 5 : 4;
    facultyByDept[d.code] = [];
    for (let i = 0; i < count; i++) {
      const isDemo = d.code === 'CSE' && i === 1;
      const first = isDemo ? 'Rajesh' : pick(FIRST);
      const last = isDemo ? 'Iyer' : pick(LAST);
      const email = isDemo ? 'faculty@university.edu' : emailFor(first, last, 'northbridge.edu');
      usedEmails.add(email);
      const u = await User.collection.insertOne({
        name: `Dr. ${first} ${last}`,
        email,
        password: facultyHash,
        role: 'faculty',
        phone: `+91 98${between(10000000, 99999999)}`,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const f = await Faculty.create({
        user: u.insertedId,
        employeeId: `EMP${empNo++}`,
        department: d._id,
        designation: designations[Math.min(i, 3)],
        qualification: 'Ph.D.',
        specialization: specs[d.code][i % specs[d.code].length],
        experienceYears: between(4, 22),
        joiningDate: day(between(2006, 2021), between(1, 12), 1),
        officeRoom: `${d.code}-${between(101, 320)}`,
      });
      facultyByDept[d.code].push({ _id: f._id, user: u.insertedId as Id });
    }
    await Department.updateOne({ _id: d._id }, { hod: facultyByDept[d.code][0]._id });
  }
  const demoFaculty = facultyByDept.CSE[1];

  // ---------- sections ----------
  const sectionDefs = [
    { program: 'BTCSE', sem: 5, name: 'A', batch: '2024-28', dept: 'CSE' },
    { program: 'BTCSE', sem: 5, name: 'B', batch: '2024-28', dept: 'CSE' },
    { program: 'BTCSE', sem: 3, name: 'A', batch: '2025-29', dept: 'CSE' },
    { program: 'BTECE', sem: 5, name: 'A', batch: '2024-28', dept: 'ECE' },
    { program: 'BTECE', sem: 3, name: 'A', batch: '2025-29', dept: 'ECE' },
    { program: 'BTME', sem: 5, name: 'A', batch: '2024-28', dept: 'ME' },
    { program: 'MBA', sem: 3, name: 'A', batch: '2025-27', dept: 'SOB' },
  ];
  const sections = [];
  for (const [i, s] of sectionDefs.entries()) {
    const advisor = s.program === 'BTCSE' && s.sem === 5 && s.name === 'A' ? demoFaculty : facultyByDept[s.dept][i % facultyByDept[s.dept].length];
    const sec = await Section.create({
      name: s.name,
      program: progBy[s.program]._id,
      semesterNumber: s.sem,
      batch: s.batch,
      classAdvisor: advisor._id,
      room: `${s.dept}-${200 + i}`,
      capacity: 60,
    });
    sections.push({ ...s, _id: sec._id });
  }

  // ---------- courses ----------
  const catalog: Record<string, Record<number, [string, string, number, string][]>> = {
    BTCSE: {
      2: [['CS201', 'Data Structures', 4, 'Theory'], ['CS202', 'Digital Logic Design', 3, 'Theory'], ['MA201', 'Discrete Mathematics', 4, 'Theory'], ['CS203', 'Object Oriented Programming', 3, 'Theory'], ['CS204', 'Data Structures Lab', 2, 'Lab']],
      3: [['CS301', 'Design & Analysis of Algorithms', 4, 'Theory'], ['CS302', 'Computer Organization', 3, 'Theory'], ['MA301', 'Probability & Statistics', 4, 'Theory'], ['CS303', 'Database Management Systems', 3, 'Theory'], ['CS304', 'DBMS Lab', 2, 'Lab']],
      4: [['CS401', 'Operating Systems', 4, 'Theory'], ['CS402', 'Theory of Computation', 3, 'Theory'], ['CS403', 'Software Engineering', 3, 'Theory'], ['CS404', 'Computer Networks', 4, 'Theory'], ['CS405', 'OS Lab', 2, 'Lab']],
      5: [['CS501', 'Machine Learning', 4, 'Theory'], ['CS502', 'Compiler Design', 3, 'Theory'], ['CS503', 'Distributed Systems', 3, 'Theory'], ['CS504', 'Web Technologies', 3, 'Elective'], ['CS505', 'Machine Learning Lab', 2, 'Lab']],
    },
    BTECE: {
      2: [['EC201', 'Network Analysis', 4, 'Theory'], ['EC202', 'Electronic Devices', 3, 'Theory'], ['MA202', 'Engineering Mathematics II', 4, 'Theory'], ['EC203', 'Devices Lab', 2, 'Lab']],
      3: [['EC301', 'Analog Circuits', 4, 'Theory'], ['EC302', 'Signals & Systems', 4, 'Theory'], ['EC303', 'Digital Electronics', 3, 'Theory'], ['EC304', 'Analog Lab', 2, 'Lab']],
      4: [['EC401', 'Microprocessors', 4, 'Theory'], ['EC402', 'Electromagnetic Theory', 3, 'Theory'], ['EC403', 'Control Systems', 3, 'Theory'], ['EC404', 'Microprocessors Lab', 2, 'Lab']],
      5: [['EC501', 'Digital Signal Processing', 4, 'Theory'], ['EC502', 'VLSI Design', 3, 'Theory'], ['EC503', 'Communication Systems', 4, 'Theory'], ['EC504', 'DSP Lab', 2, 'Lab']],
    },
    BTME: {
      4: [['ME401', 'Fluid Mechanics', 4, 'Theory'], ['ME402', 'Kinematics of Machines', 3, 'Theory'], ['ME403', 'Manufacturing Processes', 3, 'Theory'], ['ME404', 'Workshop Practice', 2, 'Lab']],
      5: [['ME501', 'Heat Transfer', 4, 'Theory'], ['ME502', 'Design of Machine Elements', 4, 'Theory'], ['ME503', 'Dynamics of Machinery', 3, 'Theory'], ['ME504', 'Heat Transfer Lab', 2, 'Lab']],
    },
    MBA: {
      2: [['MB201', 'Financial Management', 4, 'Theory'], ['MB202', 'Marketing Management', 4, 'Theory'], ['MB203', 'Operations Management', 3, 'Theory'], ['MB204', 'Business Research Methods', 3, 'Theory']],
      3: [['MB301', 'Strategic Management', 4, 'Theory'], ['MB302', 'Investment Analysis', 3, 'Elective'], ['MB303', 'Digital Marketing', 3, 'Elective'], ['MB304', 'Business Analytics', 3, 'Theory']],
    },
  };
  const deptOfProgram: Record<string, string> = { BTCSE: 'CSE', BTECE: 'ECE', BTME: 'ME', MBA: 'SOB' };

  const courseDocs: { _id: Id; code: string; credits: number; type: string; program: string; sem: number; faculty: Id; sections: Id[] }[] = [];
  for (const [prog, sems] of Object.entries(catalog)) {
    const dept = deptOfProgram[prog];
    const pool = facultyByDept[dept];
    for (const [semStr, list] of Object.entries(sems)) {
      const sem = Number(semStr);
      const secIds = sections.filter((s) => s.program === prog && s.sem === sem).map((s) => s._id);
      for (const [i, [code, title, credits, type]] of list.entries()) {
        // The demo faculty teaches the two headline CSE semester-5 courses and one semester-3 course.
        const teacher =
          ['CS501', 'CS505', 'CS303'].includes(code) ? demoFaculty : pool[(i + sem) % pool.length];
        const c = await Course.create({
          code,
          title,
          credits,
          type: type as 'Theory',
          department: deptBy[dept]._id,
          program: progBy[prog]._id,
          semesterNumber: sem,
          faculty: [teacher._id],
          sections: secIds,
          description: `${title} covers the core concepts, techniques and applications of the subject with hands-on practice.`,
        });
        courseDocs.push({ _id: c._id, code, credits, type, program: prog, sem, faculty: teacher._id, sections: secIds });
      }
    }
  }

  // ---------- transport & hostels ----------
  const routes = await TransportRoute.insertMany([
    { routeNo: 'R1', name: 'Whitefield – Campus', vehicleNo: 'KA01 AB 1234', driverName: 'Manjunath', driverPhone: '+91 99000 11111', capacity: 45, fee: 18000, stops: [{ name: 'Whitefield', time: '07:15' }, { name: 'Marathahalli', time: '07:35' }, { name: 'Bellandur', time: '07:55' }, { name: 'Campus', time: '08:30' }] },
    { routeNo: 'R2', name: 'Jayanagar – Campus', vehicleNo: 'KA01 CD 5678', driverName: 'Suresh', driverPhone: '+91 99000 22222', capacity: 45, fee: 16000, stops: [{ name: 'Jayanagar 4th Block', time: '07:20' }, { name: 'BTM Layout', time: '07:40' }, { name: 'Silk Board', time: '07:55' }, { name: 'Campus', time: '08:30' }] },
    { routeNo: 'R3', name: 'Hebbal – Campus', vehicleNo: 'KA01 EF 9012', driverName: 'Ramesh', driverPhone: '+91 99000 33333', capacity: 40, fee: 20000, stops: [{ name: 'Hebbal', time: '07:00' }, { name: 'Indiranagar', time: '07:30' }, { name: 'Koramangala', time: '07:50' }, { name: 'Campus', time: '08:30' }] },
  ]);
  const hostels = await Hostel.insertMany([
    { name: 'Aryabhata Hall', type: 'Boys', warden: 'Mr. Prakash Rao', contact: '+91 80 4000 2001', totalRooms: 120, capacity: 240, feePerSemester: 55000 },
    { name: 'Gargi Hall', type: 'Girls', warden: 'Mrs. Lakshmi Menon', contact: '+91 80 4000 2002', totalRooms: 100, capacity: 200, feePerSemester: 55000 },
    { name: 'Raman Residency', type: 'Co-ed', warden: 'Dr. Vikram Shetty', contact: '+91 80 4000 2003', totalRooms: 60, capacity: 60, feePerSemester: 72000 },
  ]);

  // ---------- students ----------
  type SeedStudent = { _id: Id; user: Id; section: Id; sectionIdx: number; program: string; sem: number; gender: string; base: number };
  const students: SeedStudent[] = [];
  const studentUsers: Record<string, unknown>[] = [];
  const studentDocs: Record<string, unknown>[] = [];
  let enroll = 1;
  for (const [si, s] of sections.entries()) {
    const size = s.program === 'BTCSE' ? 22 : 16;
    const joinYear = Number(s.batch.slice(0, 4));
    for (let i = 0; i < size; i++) {
      const isDemo = si === 0 && i === 0;
      const gender = isDemo ? 'male' : rand() > 0.48 ? 'male' : 'female';
      const first = isDemo ? 'Aarav' : pick(FIRST);
      const last = isDemo ? 'Sharma' : pick(LAST);
      const userId = newId();
      const studentId = newId();
      const email = isDemo ? 'student@university.edu' : emailFor(first, last, 'students.northbridge.edu');
      usedEmails.add(email);
      studentUsers.push({
        _id: userId,
        name: `${first} ${last}`,
        email,
        password: studentHash,
        role: 'student',
        phone: `+91 9${between(100000000, 999999999)}`,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const enrollmentNo = `NBU${String(joinYear).slice(2)}${s.program.replace('BT', '')}${String(enroll++).padStart(4, '0')}`;
      studentDocs.push({
        _id: studentId,
        user: userId,
        enrollmentNo,
        rollNo: `${s.sem}${s.name}${String(i + 1).padStart(2, '0')}`,
        department: deptBy[deptOfProgram[s.program]]._id,
        program: progBy[s.program]._id,
        section: s._id,
        currentSemester: s.sem,
        batch: s.batch,
        dob: day(joinYear - 18 - (s.program === 'MBA' ? 4 : 0), between(1, 12), between(1, 28)),
        gender,
        bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'A-', 'O-']),
        address: `${between(1, 999)}, ${pick(['MG Road', 'Park Street', 'Lake View', 'Temple Road', 'Station Road'])}, ${pick(CITIES)}`,
        guardian: { name: `${pick(FIRST)} ${last}`, relation: pick(['Father', 'Mother']), phone: `+91 9${between(100000000, 999999999)}` },
        admissionDate: day(joinYear, 7, 20),
        status: 'active',
        transportRoute: rand() < 0.3 ? pick(routes)._id : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      students.push({
        _id: studentId,
        user: userId,
        section: s._id,
        sectionIdx: si,
        program: s.program,
        sem: s.sem,
        gender,
        base: isDemo ? 0.86 : 0.62 + rand() * 0.36,
      });
    }
  }
  await User.collection.insertMany(studentUsers);
  await Student.collection.insertMany(studentDocs);
  const demoStudent = students[0];

  // Hostel allocations for ~25% of students.
  const allocations = students
    .filter(() => rand() < 0.25)
    .map((s) => {
      const hostel = s.gender === 'female' ? (rand() < 0.8 ? hostels[1] : hostels[2]) : rand() < 0.8 ? hostels[0] : hostels[2];
      return { hostel: hostel._id, student: s._id, roomNo: `${pick(['A', 'B', 'C'])}-${between(101, 330)}`, fromDate: day(2026, 7, 12), status: 'active' };
    });
  await HostelAllocation.insertMany(allocations);

  // ---------- timetable ----------
  const slots = [
    ['09:00', '10:00'],
    ['10:00', '11:00'],
    ['11:15', '12:15'],
    ['13:15', '14:15'],
    ['14:15', '16:15'],
  ];
  const timetable: { section: Id; course: Id; faculty: Id; day: string; startTime: string; endTime: string; room: string; type: string }[] = [];
  for (const [si, s] of sections.entries()) {
    const secCourses = courseDocs.filter((c) => c.program === s.program && c.sem === s.sem);
    const theory = secCourses.filter((c) => c.type !== 'Lab');
    const labs = secCourses.filter((c) => c.type === 'Lab');
    for (const [di, d] of DAYS.slice(0, 5).entries()) {
      for (let k = 0; k < 4; k++) {
        const c = theory[(di + k + si) % theory.length];
        timetable.push({ section: s._id, course: c._id, faculty: c.faculty, day: d, startTime: slots[k][0], endTime: slots[k][1], room: `LH-${100 + si * 3 + (k % 3)}`, type: 'Lecture' });
      }
      const lab = labs.length && di % 2 === 0 ? labs[0] : theory[(di + si + 2) % theory.length];
      timetable.push({ section: s._id, course: lab._id, faculty: lab.faculty, day: d, startTime: slots[4][0], endTime: slots[4][1], room: lab.type === 'Lab' ? `LAB-${si + 1}` : `LH-${100 + si * 3}`, type: lab.type === 'Lab' ? 'Lab' : 'Tutorial' });
    }
  }
  await TimetableEntry.insertMany(timetable);

  // ---------- holidays ----------
  const holidays = await Holiday.insertMany([
    { title: 'Independence Day', date: day(2026, 8, 15), type: 'National' },
    { title: 'Janmashtami', date: day(2026, 9, 4), type: 'Religious' },
    { title: 'Gandhi Jayanti', date: day(2026, 10, 2), type: 'National' },
    { title: 'Dussehra', date: day(2026, 10, 20), type: 'Religious' },
    { title: 'Diwali Break', date: day(2026, 11, 7), endDate: day(2026, 11, 10), type: 'Vacation', description: 'University closed for Deepavali.' },
    { title: 'Kannada Rajyotsava', date: day(2026, 11, 1), type: 'National' },
    { title: 'Guru Nanak Jayanti', date: day(2026, 11, 24), type: 'Religious' },
    { title: 'Foundation Day', date: day(2026, 12, 4), type: 'University', description: 'Annual foundation day celebrations.' },
    { title: 'Christmas', date: day(2026, 12, 25), type: 'Religious' },
    { title: 'Winter Vacation', date: day(2026, 12, 21), endDate: day(2027, 1, 3), type: 'Vacation' },
    { title: 'Republic Day', date: day(2027, 1, 26), type: 'National' },
  ]);
  const holidaySet = new Set(holidays.map((h) => h.date.toDateString()));

  // ---------- attendance (term start → yesterday) ----------
  const bySection = new Map<string, SeedStudent[]>();
  for (const s of students) {
    const k = String(s.section);
    bySection.set(k, [...(bySection.get(k) ?? []), s]);
  }
  const sessions: Record<string, unknown>[] = [];
  for (let d = new Date(termStart); d < today; d = addDays(d, 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6 || holidaySet.has(d.toDateString())) continue;
    const dayName = ['Sunday', ...DAYS][dow];
    for (const tt of timetable.filter((t) => t.day === dayName)) {
      const roster = bySection.get(String(tt.section)) ?? [];
      sessions.push({
        course: tt.course,
        section: tt.section,
        faculty: tt.faculty,
        date: new Date(d),
        startTime: tt.startTime,
        topic: undefined,
        records: roster.map((st) => {
          const r = rand();
          const status = r < st.base ? 'present' : r < st.base + 0.03 ? 'late' : r < st.base + 0.05 ? 'excused' : 'absent';
          return { student: st._id, status };
        }),
        createdAt: new Date(d),
        updatedAt: new Date(d),
      });
    }
  }
  await AttendanceSession.collection.insertMany(sessions);

  // ---------- assignments, submissions, diary ----------
  const assignmentTitles = ['Problem Set', 'Case Study', 'Mini Project', 'Lab Record', 'Research Summary'];
  const assignments: Record<string, unknown>[] = [];
  const submissions: Record<string, unknown>[] = [];
  const diary: Record<string, unknown>[] = [];
  const currentCourses = courseDocs.filter((c) => c.sections.length);
  for (const c of currentCourses) {
    for (const secId of c.sections) {
      const roster = bySection.get(String(secId)) ?? [];
      const dues = [addDays(today, -18), addDays(today, -4), addDays(today, 6), addDays(today, 13)];
      dues.forEach((due, i) => {
        const aId = newId();
        const maxMarks = pick([10, 20, 25]);
        assignments.push({
          _id: aId,
          title: `${c.code} ${assignmentTitles[i % assignmentTitles.length]} ${i + 1}`,
          description: 'Answer all questions. Show your working and cite any references used. Upload a single PDF.',
          course: c._id,
          section: secId,
          faculty: c.faculty,
          dueDate: new Date(due.getTime() + 23.99 * 3600_000),
          maxMarks,
          attachments: [],
          status: 'published',
          createdAt: addDays(due, -10),
          updatedAt: addDays(due, -10),
        });
        const isPast = due < today;
        for (const st of roster) {
          if (!isPast && rand() > 0.35) continue;
          if (isPast && rand() > 0.88) continue;
          const graded = isPast && i === 0;
          submissions.push({
            assignment: aId,
            student: st._id,
            text: 'Please find my submission attached.',
            files: [],
            submittedAt: addDays(due, -between(0, 3)),
            status: graded ? 'graded' : 'submitted',
            marks: graded ? Math.round(maxMarks * (0.55 + rand() * 0.45)) : undefined,
            feedback: graded ? pick(['Well done.', 'Good attempt; revise section 2.', 'Clear and well structured.', 'Needs more detail in the analysis.']) : undefined,
            gradedAt: graded ? addDays(due, 3) : undefined,
            createdAt: addDays(due, -1),
            updatedAt: addDays(due, -1),
          });
        }
      });
      for (let w = 0; w < 8; w++) {
        const date = addDays(today, -1 - w * 3);
        if (date.getDay() === 0 || date.getDay() === 6) continue;
        diary.push({
          course: c._id,
          section: secId,
          faculty: c.faculty,
          date,
          topic: `${c.code}: Unit ${Math.max(1, 4 - Math.floor(w / 2))} – ${pick(['Introduction and motivation', 'Core concepts', 'Worked examples', 'Problem solving session', 'Case discussion', 'Revision and Q&A'])}`,
          description: 'Covered lecture material with examples. Slides are shared on the course page.',
          homework: rand() < 0.5 ? 'Read the next chapter and attempt the end-of-chapter exercises.' : undefined,
          attachments: [],
          createdAt: date,
          updatedAt: date,
        });
      }
    }
  }
  await Assignment.collection.insertMany(assignments);
  await Submission.collection.insertMany(submissions);
  await DiaryEntry.collection.insertMany(diary);

  // ---------- exams & results ----------
  const exams: Record<string, unknown>[] = [];
  const results: Record<string, unknown>[] = [];
  const addResults = (examId: Id, course: typeof courseDocs[number], roster: SeedStudent[], max: number, bias = 0) => {
    for (const st of roster) {
      const absent = rand() < 0.02;
      const perf = Math.min(1, Math.max(0.2, st.base - 0.1 + bias + (rand() - 0.5) * 0.35));
      const obtained = absent ? 0 : Math.round(max * perf);
      const percentage = Math.round((obtained / max) * 1000) / 10;
      const band = gradeFor(percentage);
      results.push({
        exam: examId,
        student: st._id,
        course: course._id,
        marksObtained: obtained,
        maxMarks: max,
        percentage,
        grade: absent ? 'AB' : band.grade,
        gradePoints: absent ? 0 : band.points,
        isAbsent: absent,
        enteredBy: adminId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  };

  for (const c of currentCourses) {
    const roster = c.sections.flatMap((sid) => bySection.get(String(sid)) ?? []);
    const mid1 = newId();
    exams.push({ _id: mid1, name: 'Mid Term 1', type: 'Mid Term', course: c._id, semester: currentTerm._id, date: day(2026, 9, 8 + (c.code.charCodeAt(4) % 5)), startTime: '10:00', endTime: '11:30', room: 'Exam Hall 1', maxMarks: 50, passingMarks: 20, resultsPublished: true, createdAt: new Date(), updatedAt: new Date() });
    addResults(mid1, c, roster, 50);
    exams.push({ _id: newId(), name: 'Mid Term 2', type: 'Mid Term', course: c._id, semester: currentTerm._id, date: day(2026, 10, 26 + (c.code.charCodeAt(4) % 5)), startTime: '10:00', endTime: '11:30', room: 'Exam Hall 1', maxMarks: 50, passingMarks: 20, resultsPublished: false, instructions: 'Bring your ID card. No electronic devices allowed.', createdAt: new Date(), updatedAt: new Date() });
    exams.push({ _id: newId(), name: 'End Term Examination', type: c.type === 'Lab' ? 'Practical' : 'End Term', course: c._id, semester: currentTerm._id, date: day(2026, 12, 1 + (c.code.charCodeAt(4) % 9)), startTime: '09:30', endTime: '12:30', room: `Exam Hall ${1 + (c.code.charCodeAt(4) % 3)}`, maxMarks: 100, passingMarks: 40, resultsPublished: false, instructions: 'Reach the exam hall 20 minutes early. Hall tickets are mandatory.', createdAt: new Date(), updatedAt: new Date() });
    // A quiz a few days from now so "upcoming" is never empty.
    exams.push({ _id: newId(), name: 'Quiz 2', type: 'Quiz', course: c._id, section: c.sections[0], semester: currentTerm._id, date: addDays(today, 3 + (c.code.charCodeAt(4) % 6)), startTime: '11:15', endTime: '11:45', room: 'Classroom', maxMarks: 10, passingMarks: 4, resultsPublished: false, createdAt: new Date(), updatedAt: new Date() });
  }
  // Previous semester end-terms give students an SGPA/CGPA history.
  for (const c of courseDocs.filter((x) => !x.sections.length)) {
    const roster = students.filter((s) => s.program === c.program && s.sem === c.sem + 1);
    if (!roster.length) continue;
    const e = newId();
    exams.push({ _id: e, name: 'End Term Examination', type: 'End Term', course: c._id, semester: prevTerm._id, date: day(2026, 5, 4 + (c.code.charCodeAt(4) % 12)), startTime: '09:30', endTime: '12:30', room: 'Exam Hall 1', maxMarks: 100, passingMarks: 40, resultsPublished: true, createdAt: new Date(), updatedAt: new Date() });
    addResults(e, c, roster, 100, 0.05);
  }
  await Exam.collection.insertMany(exams);
  await Result.collection.insertMany(results);

  // CGPA from previous end-terms.
  const credits = new Map(courseDocs.map((c) => [String(c._id), c.credits]));
  const prevExamIds = new Set(exams.filter((e) => e.semester === prevTerm._id).map((e) => String(e._id)));
  const cg = new Map<string, { c: number; p: number }>();
  for (const r of results) {
    if (!prevExamIds.has(String(r.exam))) continue;
    const k = String(r.student);
    const cr = credits.get(String(r.course)) ?? 0;
    const v = cg.get(k) ?? { c: 0, p: 0 };
    v.c += cr;
    v.p += cr * (r.gradePoints as number);
    cg.set(k, v);
  }
  await Student.bulkWrite(
    [...cg.entries()].map(([id, v]) => ({
      updateOne: { filter: { _id: new mongoose.Types.ObjectId(id) }, update: { $set: { cgpa: Math.round((v.p / v.c) * 100) / 100 } } },
    })),
  );

  // ---------- fees ----------
  const fees: Record<string, unknown>[] = [];
  const tuition: Record<string, number> = { BTCSE: 125000, BTECE: 110000, BTME: 105000, MBA: 150000 };
  const methods = ['upi', 'card', 'online', 'bank-transfer'] as const;
  for (const st of students) {
    const amount = tuition[st.program];
    // Previous term: fully paid, spread over Jan–Mar to populate the collection chart.
    const prevPaidAt = day(2026, between(1, 3), between(1, 28));
    fees.push({ student: st._id, title: `Tuition Fee – Semester ${st.sem - 1}`, category: 'Tuition', amount, paidAmount: amount, dueDate: day(2026, 1, 31), academicYear: '2025-26', semesterNumber: st.sem - 1, status: 'paid', payments: [{ _id: newId(), amount, paidAt: prevPaidAt, method: pick(methods), transactionId: `TXN${prevPaidAt.getTime()}${between(100, 999)}` }], createdAt: day(2025, 12, 20), updatedAt: prevPaidAt });
    // Current term tuition: most paid, some partial or pending.
    const r = rand();
    const isDemo = st._id.equals(demoStudent._id);
    const paid = isDemo ? amount / 2 : r < 0.68 ? amount : r < 0.85 ? Math.round(amount / 2) : 0;
    const payments = [];
    if (paid) {
      const at = day(2026, between(7, 9), between(1, 25));
      payments.push({ _id: newId(), amount: paid, paidAt: at, method: pick(methods), transactionId: `TXN${at.getTime()}${between(100, 999)}` });
    }
    fees.push({ student: st._id, title: `Tuition Fee – Semester ${st.sem}`, category: 'Tuition', amount, paidAmount: paid, dueDate: day(2026, 8, 31), academicYear: '2026-27', semesterNumber: st.sem, status: paid >= amount ? 'paid' : paid ? 'partial' : 'overdue', payments, createdAt: day(2026, 7, 1), updatedAt: new Date() });
    fees.push({ student: st._id, title: `Examination Fee – Semester ${st.sem}`, category: 'Examination', amount: 3500, paidAmount: 0, dueDate: day(2026, 10, 31), academicYear: '2026-27', semesterNumber: st.sem, status: 'pending', payments: [], createdAt: day(2026, 9, 15), updatedAt: new Date() });
    if (allocations.some((a) => a.student.equals(st._id))) {
      fees.push({ student: st._id, title: 'Hostel Fee – Odd Semester', category: 'Hostel', amount: 55000, paidAmount: 55000, dueDate: day(2026, 7, 31), academicYear: '2026-27', semesterNumber: st.sem, status: 'paid', payments: [{ _id: newId(), amount: 55000, paidAt: day(2026, 7, 10), method: 'online', transactionId: `TXNH${between(100000, 999999)}` }], createdAt: day(2026, 7, 1), updatedAt: new Date() });
    }
  }
  await Fee.collection.insertMany(fees);

  // ---------- events & circulars ----------
  await Event.insertMany([
    { title: 'TechNova 2026 – National Hackathon', category: 'Academic', startDate: addDays(today, 9), endDate: addDays(today, 10), venue: 'Innovation Centre', organizer: 'CSE Department', description: '36-hour hackathon with industry mentors and prizes worth ₹5 lakh.', registrationLink: 'https://northbridge.edu/technova' },
    { title: 'Guest Lecture: Responsible AI', category: 'Seminar', startDate: addDays(today, 4), venue: 'Main Auditorium', organizer: 'AI Club', description: 'A talk on building safe and fair AI systems.' },
    { title: 'Utsav – Annual Cultural Fest', category: 'Cultural', startDate: addDays(today, 24), endDate: addDays(today, 26), venue: 'Open Air Theatre', organizer: 'Student Council', description: 'Music, dance, drama and food stalls across three days.' },
    { title: 'Inter-University Football Tournament', category: 'Sports', startDate: addDays(today, 15), endDate: addDays(today, 19), venue: 'University Stadium', organizer: 'Sports Committee' },
    { title: 'Workshop on Cloud-Native Development', category: 'Workshop', startDate: addDays(today, 6), venue: 'Lab Complex 2', organizer: 'ACM Student Chapter', description: 'Hands-on containers, Kubernetes and CI/CD.' },
    { title: 'Placement Orientation – Batch 2027', category: 'Placement', startDate: addDays(today, 2), venue: 'Seminar Hall A', organizer: 'Training & Placement Cell' },
    { title: 'Freshers Welcome 2026', category: 'Cultural', startDate: addDays(today, -40), venue: 'Main Auditorium', organizer: 'Student Council' },
  ]);

  await Circular.insertMany([
    { title: 'Mid Term 2 Examination Schedule', referenceNo: 'NBU/EXAM/2026/112', content: 'Mid Term 2 examinations for all UG and PG programs will be held from 26 October 2026. Detailed course-wise schedules are available in the Examinations section. Students must carry their ID cards.', audience: 'all', priority: 'important', publishedBy: adminId, publishedAt: addDays(today, -2) },
    { title: 'Minimum Attendance Requirement', referenceNo: 'NBU/ACAD/2026/087', content: 'Students are reminded that a minimum of 75% attendance in each course is mandatory to be eligible for end term examinations. Students below the threshold should meet their class advisor.', audience: 'students', priority: 'urgent', publishedBy: adminId, publishedAt: addDays(today, -5) },
    { title: 'Last Date for Examination Fee Payment', referenceNo: 'NBU/FIN/2026/045', content: 'The examination fee for the odd semester must be paid by 31 October 2026. A late fee of ₹50 per day applies thereafter.', audience: 'students', priority: 'important', publishedBy: adminId, publishedAt: addDays(today, -9) },
    { title: 'Faculty Development Programme on Outcome-Based Education', referenceNo: 'NBU/HR/2026/031', content: 'A two-day FDP on OBE will be conducted in the Board Room. All faculty members are requested to register by Friday.', audience: 'faculty', priority: 'normal', publishedBy: adminId, publishedAt: addDays(today, -3) },
    { title: 'Library Timings Extended', referenceNo: 'NBU/LIB/2026/012', content: 'The central library will remain open until 11:00 PM on weekdays during the examination period.', audience: 'all', priority: 'normal', publishedBy: adminId, publishedAt: addDays(today, -12) },
    { title: 'Campus Wi-Fi Maintenance', referenceNo: 'NBU/IT/2026/019', content: 'Wi-Fi services will be intermittently unavailable on Saturday between 10 AM and 2 PM due to scheduled maintenance.', audience: 'all', priority: 'normal', publishedBy: adminId, publishedAt: addDays(today, -16) },
  ]);

  // ---------- documents ----------
  const docs = [
    { title: 'Academic Calendar 2026-27', category: 'Handbook', audience: 'all', file: writePdf('academic-calendar-2026-27.pdf', 'Academic Calendar 2026-27', ['Odd semester: 15 Jul 2026 - 15 Dec 2026', 'Mid Term 1: 8-12 Sep 2026', 'Mid Term 2: 26-30 Oct 2026', 'End Term: 1-12 Dec 2026']) },
    { title: 'Student Handbook', category: 'Handbook', audience: 'students', file: writePdf('student-handbook.pdf', 'Student Handbook', ['Code of conduct', 'Attendance policy: minimum 75%', 'Examination rules', 'Grievance redressal']) },
    { title: 'Leave Application Form', category: 'Form', audience: 'all', file: writePdf('leave-form.pdf', 'Leave Application Form', ['Name:', 'Enrollment / Employee No:', 'Dates:', 'Reason:', 'Signature:']) },
    { title: 'Faculty Service Rules', category: 'Handbook', audience: 'faculty', file: writePdf('faculty-service-rules.pdf', 'Faculty Service Rules', ['Working hours', 'Leave entitlement', 'Research allowance']) },
    { title: 'Bonafide Certificate', category: 'Certificate', owner: demoStudent.user, file: writePdf('bonafide-demo.pdf', 'Bonafide Certificate', ['This is to certify that Aarav Sharma', 'is a bonafide student of B.Tech CSE, Semester 5', 'for the academic year 2026-27.']) },
    { title: 'Semester 4 Grade Card', category: 'Marksheet', owner: demoStudent.user, file: writePdf('gradecard-sem4-demo.pdf', 'Grade Card - Semester 4', ['Student: Aarav Sharma', 'Program: B.Tech CSE', 'Result: PASS']) },
  ];
  await Document.insertMany(docs.map((d) => ({ ...d, uploadedBy: adminId })));

  // ---------- placements ----------
  const finalYear = students.filter((s) => s.sem === 5 || s.program === 'MBA');
  const drives = [
    ['Infosys', 'Systems Engineer', 6.5, 'completed', -60],
    ['TCS Digital', 'Digital Engineer', 7.2, 'completed', -45],
    ['Microsoft', 'Software Engineer Intern', 42, 'completed', -30],
    ['Bosch', 'Graduate Engineer Trainee', 8.5, 'completed', -25],
    ['Deloitte', 'Business Analyst', 9.5, 'completed', -20],
    ['Amazon', 'SDE Intern', 38, 'ongoing', 0],
    ['Texas Instruments', 'Analog Design Intern', 18, 'upcoming', 12],
    ['Goldman Sachs', 'Analyst', 22, 'upcoming', 20],
  ] as const;
  await Placement.insertMany(
    drives.map(([company, jobRole, pkg, status, offset]) => ({
      company,
      jobRole,
      packageLPA: pkg,
      driveDate: addDays(today, offset),
      location: pick(['Bengaluru', 'Hyderabad', 'Pune', 'Chennai']),
      eligiblePrograms: company === 'Deloitte' || company === 'Goldman Sachs' ? [progBy.MBA._id, progBy.BTCSE._id] : [progBy.BTCSE._id, progBy.BTECE._id, progBy.BTME._id],
      minCgpa: pkg > 20 ? 8 : 6.5,
      description: `${company} is hiring for the ${jobRole} role.`,
      status,
      selectedStudents: status === 'completed' ? finalYear.filter(() => rand() < (pkg > 20 ? 0.03 : 0.08)).map((s) => s._id) : [],
    })),
  );

  // ---------- library ----------
  const books = await Book.insertMany([
    ['Introduction to Algorithms', 'Cormen, Leiserson, Rivest, Stein', '9780262046305', 'Computer Science'],
    ['Operating System Concepts', 'Silberschatz, Galvin, Gagne', '9781119800361', 'Computer Science'],
    ['Database System Concepts', 'Silberschatz, Korth, Sudarshan', '9780078022159', 'Computer Science'],
    ['Pattern Recognition and Machine Learning', 'Christopher Bishop', '9780387310732', 'Computer Science'],
    ['Computer Networks', 'Andrew Tanenbaum', '9780132126953', 'Computer Science'],
    ['Compilers: Principles, Techniques, and Tools', 'Aho, Lam, Sethi, Ullman', '9780321486813', 'Computer Science'],
    ['Microelectronic Circuits', 'Sedra, Smith', '9780190853464', 'Electronics'],
    ['Signals and Systems', 'Oppenheim, Willsky', '9780138147570', 'Electronics'],
    ['Digital Signal Processing', 'Proakis, Manolakis', '9780131873742', 'Electronics'],
    ['Engineering Thermodynamics', 'P. K. Nag', '9789352606429', 'Mechanical'],
    ['Heat and Mass Transfer', 'Cengel, Ghajar', '9780073398198', 'Mechanical'],
    ['Principles of Corporate Finance', 'Brealey, Myers, Allen', '9781260013900', 'Management'],
    ['Marketing Management', 'Philip Kotler, Kevin Keller', '9780133856460', 'Management'],
    ['Good Strategy Bad Strategy', 'Richard Rumelt', '9780307886231', 'Management'],
    ['Clean Code', 'Robert C. Martin', '9780132350884', 'Computer Science'],
    ['Designing Data-Intensive Applications', 'Martin Kleppmann', '9781449373320', 'Computer Science'],
  ].map(([title, author, isbn, category]) => {
    const total = between(3, 10);
    return { title, author, isbn, category, totalCopies: total, availableCopies: total, shelf: `${category.slice(0, 2).toUpperCase()}-${between(1, 20)}` };
  }));
  const issues = [];
  for (const st of students.filter(() => rand() < 0.2)) {
    const book = pick(books);
    const issueDate = addDays(today, -between(3, 30));
    const returned = rand() < 0.4;
    issues.push({ book: book._id, student: st._id, issueDate, dueDate: addDays(issueDate, 14), returnDate: returned ? addDays(issueDate, between(5, 14)) : undefined, status: returned ? 'returned' : 'issued' });
    if (!returned) await Book.updateOne({ _id: book._id, availableCopies: { $gt: 0 } }, { $inc: { availableCopies: -1 } });
  }
  await BookIssue.insertMany(issues);

  // ---------- leave & university requests ----------
  const sec0 = bySection.get(String(sections[0]._id)) ?? [];
  await LeaveRequest.insertMany([
    { requester: demoStudent.user, role: 'student', student: demoStudent._id, type: 'Medical', fromDate: addDays(today, -21), toDate: addDays(today, -20), reason: 'Viral fever; medical certificate attached at the office.', status: 'approved', reviewedBy: demoFaculty.user, reviewRemarks: 'Get well soon.', reviewedAt: addDays(today, -21) },
    { requester: demoStudent.user, role: 'student', student: demoStudent._id, type: 'Personal', fromDate: addDays(today, 5), toDate: addDays(today, 6), reason: "Attending my sister's wedding in Pune.", status: 'pending' },
    ...sec0.slice(1, 4).map((s, i) => ({ requester: s.user, role: 'student', student: s._id, type: pick(['Medical', 'Personal', 'On Duty'] as const), fromDate: addDays(today, 1 + i), toDate: addDays(today, 2 + i), reason: pick(['Family function', 'Representing the university at a hackathon', 'Doctor appointment']), status: 'pending' })),
    { requester: facultyByDept.ECE[1].user, role: 'faculty', type: 'On Duty', fromDate: addDays(today, 8), toDate: addDays(today, 10), reason: 'Presenting a paper at IEEE conference, Chennai.', status: 'pending' },
    { requester: demoFaculty.user, role: 'faculty', type: 'Personal', fromDate: addDays(today, -35), toDate: addDays(today, -35), reason: 'Personal work.', status: 'approved', reviewedBy: adminId, reviewedAt: addDays(today, -36) },
  ]);

  await UniversityRequest.insertMany([
    { requester: demoStudent.user, student: demoStudent._id, type: 'Bonafide Certificate', subject: 'Bonafide certificate for bank account', description: 'Required for opening an education loan account.', status: 'resolved', response: 'Certificate uploaded to your Documents.', handledBy: adminId, resolvedAt: addDays(today, -6), createdAt: addDays(today, -8) },
    { requester: demoStudent.user, student: demoStudent._id, type: 'Transcript', subject: 'Transcript for internship application', status: 'in-progress', response: 'Being processed by the examination section.', handledBy: adminId, createdAt: addDays(today, -2) },
    ...students.slice(30, 36).map((s) => ({ requester: s.user, student: s._id, type: pick(['ID Card Reissue', 'Fee Receipt', 'Bonafide Certificate', 'Name Correction'] as const), subject: 'Request submitted via portal', status: 'open', createdAt: addDays(today, -between(0, 5)) })),
  ]);

  // ---------- notifications ----------
  const notes = [
    { title: 'Results published', message: 'Mid Term 1 results are now available.', type: 'result', link: '/student/results' },
    { title: 'New assignment', message: 'CS501 Mini Project 3 has been posted.', type: 'assignment', link: '/student/assignments' },
    { title: 'Fee reminder', message: 'Your tuition fee balance is due. Please pay to avoid late fees.', type: 'fee', link: '/student/fees' },
    { title: 'New circular', message: 'Mid Term 2 Examination Schedule', type: 'circular', link: '/circulars' },
    { title: 'Leave approved', message: 'Your medical leave request was approved.', type: 'leave', link: '/student/leaves', read: true },
  ];
  await Notification.insertMany(
    notes.map((n, i) => ({ user: demoStudent.user, read: false, ...n, createdAt: addDays(new Date(), -i) })),
  );
  await Notification.insertMany([
    { user: demoFaculty.user, title: 'Leave requests pending', message: '3 student leave requests await your review.', type: 'leave', link: '/faculty/leaves' },
    { user: demoFaculty.user, title: 'New circular', message: 'Faculty Development Programme on OBE', type: 'circular', link: '/circulars' },
    { user: adminId, title: 'Faculty leave request', message: 'On Duty leave awaiting review', type: 'leave', link: '/admin/leaves' },
  ]);

  console.log(
    `[seed] done in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${students.length} students, ${Object.values(facultyByDept).flat().length} faculty, ${courseDocs.length} courses, ${sessions.length} attendance sessions`,
  );
  console.log('[seed] logins: admin@university.edu / Admin@123, faculty@university.edu / Faculty@123, student@university.edu / Student@123');
}
