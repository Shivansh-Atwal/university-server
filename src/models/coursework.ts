import { Schema, model } from 'mongoose';

const { ObjectId } = Schema.Types;

const fileSchema = new Schema(
  { name: String, url: String, size: Number, mimeType: String },
  { _id: false },
);

export const ATTENDANCE_STATUS = ['present', 'absent', 'late', 'excused'] as const;

/** One class meeting with a record per enrolled student. */
export const AttendanceSession = model(
  'AttendanceSession',
  new Schema(
    {
      course: { type: ObjectId, ref: 'Course', required: true },
      section: { type: ObjectId, ref: 'Section', required: true },
      faculty: { type: ObjectId, ref: 'Faculty', required: true, index: true },
      date: { type: Date, required: true },
      startTime: { type: String, default: '09:00' },
      topic: String,
      records: [
        {
          _id: false,
          student: { type: ObjectId, ref: 'Student', required: true },
          status: { type: String, enum: ATTENDANCE_STATUS, default: 'present' },
        },
      ],
    },
    { timestamps: true },
  )
    .index({ course: 1, section: 1, date: 1, startTime: 1 }, { unique: true })
    .index({ 'records.student': 1, date: -1 }),
);

export const Assignment = model(
  'Assignment',
  new Schema(
    {
      title: { type: String, required: true, trim: true },
      description: String,
      course: { type: ObjectId, ref: 'Course', required: true, index: true },
      section: { type: ObjectId, ref: 'Section', required: true, index: true },
      faculty: { type: ObjectId, ref: 'Faculty', required: true, index: true },
      dueDate: { type: Date, required: true },
      maxMarks: { type: Number, default: 10 },
      attachments: [fileSchema],
      status: { type: String, enum: ['draft', 'published', 'closed'], default: 'published' },
    },
    { timestamps: true },
  ),
);

export const Submission = model(
  'Submission',
  new Schema(
    {
      assignment: { type: ObjectId, ref: 'Assignment', required: true },
      student: { type: ObjectId, ref: 'Student', required: true, index: true },
      text: String,
      files: [fileSchema],
      submittedAt: { type: Date, default: Date.now },
      status: { type: String, enum: ['submitted', 'late', 'graded', 'returned'], default: 'submitted' },
      marks: Number,
      feedback: String,
      gradedAt: Date,
    },
    { timestamps: true },
  ).index({ assignment: 1, student: 1 }, { unique: true }),
);

export const EXAM_TYPES = ['Quiz', 'Internal', 'Mid Term', 'End Term', 'Practical'] as const;

export const Exam = model(
  'Exam',
  new Schema(
    {
      name: { type: String, required: true, trim: true },
      type: { type: String, enum: EXAM_TYPES, default: 'Mid Term' },
      course: { type: ObjectId, ref: 'Course', required: true, index: true },
      section: { type: ObjectId, ref: 'Section', index: true },
      semester: { type: ObjectId, ref: 'Semester' },
      date: { type: Date, required: true, index: true },
      startTime: String,
      endTime: String,
      room: String,
      maxMarks: { type: Number, default: 100 },
      passingMarks: { type: Number, default: 40 },
      resultsPublished: { type: Boolean, default: false },
      instructions: String,
    },
    { timestamps: true },
  ),
);

export const Result = model(
  'Result',
  new Schema(
    {
      exam: { type: ObjectId, ref: 'Exam', required: true },
      student: { type: ObjectId, ref: 'Student', required: true, index: true },
      course: { type: ObjectId, ref: 'Course', required: true },
      marksObtained: { type: Number, required: true, min: 0 },
      maxMarks: { type: Number, required: true },
      percentage: Number,
      grade: String,
      gradePoints: Number,
      isAbsent: { type: Boolean, default: false },
      remarks: String,
      enteredBy: { type: ObjectId, ref: 'User' },
    },
    { timestamps: true },
  ).index({ exam: 1, student: 1 }, { unique: true }),
);

export const DiaryEntry = model(
  'DiaryEntry',
  new Schema(
    {
      course: { type: ObjectId, ref: 'Course', required: true },
      section: { type: ObjectId, ref: 'Section', required: true, index: true },
      faculty: { type: ObjectId, ref: 'Faculty', required: true, index: true },
      date: { type: Date, required: true },
      topic: { type: String, required: true },
      description: String,
      homework: String,
      attachments: [fileSchema],
    },
    { timestamps: true },
  ).index({ section: 1, date: -1 }),
);
