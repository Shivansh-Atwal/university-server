import { z } from 'zod';
import { DAYS } from '../models/academic.js';
import { EXAM_TYPES } from '../models/coursework.js';
import { FEE_CATEGORIES, REQUEST_TYPES } from '../models/administration.js';
import {
  email,
  fileSchema,
  idList,
  objectId,
  optBool,
  optDate,
  optEnum,
  optId,
  optNum,
  optStr,
  optTime,
  reqDate,
  reqNum,
  reqStr,
  time,
} from './common.js';

export const departmentSchema = z.object({
  name: reqStr('Name'),
  code: reqStr('Code'),
  hod: optId,
  description: optStr,
  established: optNum,
});

export const programSchema = z.object({
  name: reqStr('Name'),
  code: reqStr('Code'),
  department: objectId,
  degree: optEnum(['UG', 'PG', 'PhD', 'Diploma']),
  durationYears: optNum,
  totalSemesters: optNum,
  intake: optNum,
  description: optStr,
});

export const semesterSchema = z.object({
  name: reqStr('Name'),
  academicYear: reqStr('Academic year'),
  type: optEnum(['odd', 'even', 'summer']),
  startDate: reqDate,
  endDate: reqDate,
  isCurrent: optBool,
});

export const sectionSchema = z.object({
  name: reqStr('Name'),
  program: objectId,
  semesterNumber: reqNum.int().min(1).max(12),
  batch: optStr,
  classAdvisor: optId,
  room: optStr,
  capacity: optNum,
});

export const courseSchema = z.object({
  code: reqStr('Code'),
  title: reqStr('Title'),
  credits: optNum,
  type: optEnum(['Theory', 'Lab', 'Elective', 'Project']),
  department: objectId,
  program: objectId,
  semesterNumber: reqNum.int().min(1).max(12),
  faculty: idList.optional(),
  sections: idList.optional(),
  description: optStr,
  syllabus: optStr,
});

// End-after-start is enforced by the TimetableEntry model so it also applies to partial updates.
export const timetableSchema = z.object({
  section: objectId,
  course: objectId,
  faculty: objectId,
  day: z.enum(DAYS),
  startTime: time,
  endTime: time,
  room: optStr,
  type: optEnum(['Lecture', 'Lab', 'Tutorial']),
});

export const examSchema = z.object({
  name: reqStr('Name'),
  type: optEnum(EXAM_TYPES),
  course: objectId,
  section: optId,
  semester: optId,
  date: reqDate,
  startTime: optTime,
  endTime: optTime,
  room: optStr,
  maxMarks: optNum,
  passingMarks: optNum,
  resultsPublished: optBool,
  instructions: optStr,
});

export const resultSchema = z.object({
  exam: objectId,
  student: objectId,
  course: objectId,
  marksObtained: reqNum.min(0),
  maxMarks: reqNum.min(1),
  isAbsent: optBool,
  remarks: optStr,
});

export const feeSchema = z.object({
  student: objectId,
  title: reqStr('Title'),
  category: optEnum(FEE_CATEGORIES),
  amount: reqNum.min(0),
  paidAmount: optNum,
  dueDate: reqDate,
  academicYear: optStr,
  semesterNumber: optNum,
  status: optEnum(['pending', 'partial', 'paid', 'overdue', 'waived']),
});

export const bulkFeeSchema = z.object({
  program: objectId,
  semesterNumber: optNum,
  section: optId,
  title: reqStr('Title'),
  category: optEnum(FEE_CATEGORIES),
  amount: reqNum.min(1),
  dueDate: reqDate,
  academicYear: optStr,
});

export const holidaySchema = z.object({
  title: reqStr('Title'),
  date: reqDate,
  endDate: optDate,
  type: optEnum(['National', 'Religious', 'University', 'Vacation']),
  description: optStr,
});

export const eventSchema = z.object({
  title: reqStr('Title'),
  description: optStr,
  category: optEnum(['Academic', 'Cultural', 'Sports', 'Workshop', 'Seminar', 'Placement', 'Other']),
  startDate: reqDate,
  endDate: optDate,
  venue: optStr,
  organizer: optStr,
  image: optStr,
  registrationLink: optStr,
});

export const circularSchema = z.object({
  title: reqStr('Title'),
  content: reqStr('Content'),
  referenceNo: optStr,
  audience: optEnum(['all', 'students', 'faculty']),
  department: optId,
  priority: optEnum(['normal', 'important', 'urgent']),
  attachments: z.array(fileSchema).optional(),
  publishedAt: optDate,
});

export const documentSchema = z.object({
  title: reqStr('Title'),
  category: optEnum(['Certificate', 'Marksheet', 'ID Card', 'Form', 'Syllabus', 'Handbook', 'Other']),
  description: optStr,
  file: fileSchema,
  owner: optId,
  audience: optEnum(['all', 'students', 'faculty']),
});

export const placementSchema = z.object({
  company: reqStr('Company'),
  jobRole: reqStr('Job role'),
  packageLPA: optNum,
  driveDate: reqDate,
  location: optStr,
  eligiblePrograms: idList.optional(),
  minCgpa: optNum,
  description: optStr,
  status: optEnum(['upcoming', 'ongoing', 'completed']),
  selectedStudents: idList.optional(),
});

export const bookSchema = z.object({
  title: reqStr('Title'),
  author: reqStr('Author'),
  isbn: optStr,
  publisher: optStr,
  category: optStr,
  totalCopies: optNum,
  availableCopies: optNum,
  shelf: optStr,
});

export const bookIssueSchema = z.object({
  book: objectId,
  student: objectId,
  issueDate: optDate,
  dueDate: reqDate,
  returnDate: optDate,
  fine: optNum,
  status: optEnum(['issued', 'returned', 'lost']),
});

export const hostelSchema = z.object({
  name: reqStr('Name'),
  type: optEnum(['Boys', 'Girls', 'Co-ed']),
  warden: optStr,
  contact: optStr,
  totalRooms: optNum,
  capacity: optNum,
  feePerSemester: optNum,
  address: optStr,
});

export const hostelAllocationSchema = z.object({
  hostel: objectId,
  student: objectId,
  roomNo: reqStr('Room number'),
  fromDate: optDate,
  toDate: optDate,
  status: optEnum(['active', 'vacated']),
});

export const transportRouteSchema = z.object({
  routeNo: reqStr('Route number'),
  name: reqStr('Name'),
  vehicleNo: optStr,
  driverName: optStr,
  driverPhone: optStr,
  capacity: optNum,
  fee: optNum,
  stops: z.array(z.object({ name: z.string(), time: z.string().optional() })).optional(),
});

export const settingsSchema = z.object({
  universityName: optStr,
  shortName: optStr,
  logo: optStr,
  address: optStr,
  email: optStr,
  phone: optStr,
  website: optStr,
  currentAcademicYear: optStr,
  currentSemester: optId,
  attendanceThreshold: optNum,
  lateFeePerDay: optNum,
  libraryFinePerDay: optNum,
  maxBooksPerStudent: optNum,
  allowStudentLeaveRequests: optBool,
});

// ---- people ----

const userFields = {
  name: reqStr('Name'),
  email,
  password: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(6, 'Min 6 characters').optional()),
  phone: optStr,
  isActive: optBool,
};

export const studentSchema = z.object({
  ...userFields,
  enrollmentNo: reqStr('Enrollment number'),
  rollNo: optStr,
  department: objectId,
  program: objectId,
  section: optId,
  currentSemester: optNum,
  batch: optStr,
  dob: optDate,
  gender: optEnum(['male', 'female', 'other']),
  bloodGroup: optStr,
  address: optStr,
  guardianName: optStr,
  guardianRelation: optStr,
  guardianPhone: optStr,
  admissionDate: optDate,
  status: optEnum(['active', 'graduated', 'suspended', 'dropped']),
  cgpa: optNum,
  transportRoute: optId,
});

export const facultySchema = z.object({
  ...userFields,
  employeeId: reqStr('Employee ID'),
  department: objectId,
  designation: optEnum(['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Lab Instructor']),
  qualification: optStr,
  specialization: optStr,
  experienceYears: optNum,
  joiningDate: optDate,
  officeRoom: optStr,
  status: optEnum(['active', 'on-leave', 'inactive']),
});

// ---- self-service ----

export const leaveRequestSchema = z
  .object({
    type: optEnum(['Medical', 'Personal', 'On Duty', 'Emergency', 'Other']),
    fromDate: reqDate,
    toDate: reqDate,
    reason: reqStr('Reason').max(1000),
    attachment: fileSchema.optional(),
  })
  .refine((v) => v.toDate >= v.fromDate, { message: 'End date must be on or after start date', path: ['toDate'] });

export const reviewLeaveSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewRemarks: optStr,
});

export const universityRequestSchema = z.object({
  type: z.enum(REQUEST_TYPES),
  subject: reqStr('Subject').max(200),
  description: optStr,
});

export const respondRequestSchema = z.object({
  status: z.enum(['open', 'in-progress', 'resolved', 'rejected']),
  response: optStr,
});

export const assignmentSchema = z.object({
  title: reqStr('Title'),
  description: optStr,
  course: objectId,
  section: objectId,
  dueDate: reqDate,
  maxMarks: optNum,
  status: optEnum(['draft', 'published', 'closed']),
  attachments: z.array(fileSchema).optional(),
});

export const submitAssignmentSchema = z.object({
  text: optStr,
  files: z.array(fileSchema).optional(),
});

export const gradeSubmissionSchema = z.object({
  marks: reqNum.min(0),
  feedback: optStr,
});

export const diarySchema = z.object({
  course: objectId,
  section: objectId,
  date: reqDate,
  topic: reqStr('Topic'),
  description: optStr,
  homework: optStr,
  attachments: z.array(fileSchema).optional(),
});

export const attendanceSchema = z.object({
  course: objectId,
  section: objectId,
  date: reqDate,
  startTime: optTime,
  topic: optStr,
  records: z
    .array(z.object({ student: objectId, status: z.enum(['present', 'absent', 'late', 'excused']) }))
    .min(1, 'At least one student record is required'),
});

export const marksUploadSchema = z.object({
  marks: z
    .array(
      z.object({
        student: objectId,
        marksObtained: reqNum.min(0),
        isAbsent: optBool,
        remarks: optStr,
      }),
    )
    .min(1),
});

export const payFeeSchema = z.object({
  amount: reqNum.positive('Amount must be positive'),
  method: z.enum(['online', 'card', 'upi', 'cash', 'bank-transfer']).default('online'),
});

export const profileUpdateSchema = z.object({
  phone: optStr,
  address: optStr,
  bloodGroup: optStr,
  guardianName: optStr,
  guardianRelation: optStr,
  guardianPhone: optStr,
  avatar: optStr,
  qualification: optStr,
  specialization: optStr,
  officeRoom: optStr,
});
