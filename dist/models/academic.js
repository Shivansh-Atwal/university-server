import { Schema, model } from 'mongoose';
const { ObjectId } = Schema.Types;
export const Department = model('Department', new Schema({
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    hod: { type: ObjectId, ref: 'Faculty' },
    description: String,
    established: Number,
}, { timestamps: true }));
export const Program = model('Program', new Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    department: { type: ObjectId, ref: 'Department', required: true, index: true },
    degree: { type: String, enum: ['UG', 'PG', 'PhD', 'Diploma'], default: 'UG' },
    durationYears: { type: Number, default: 4 },
    totalSemesters: { type: Number, default: 8 },
    intake: { type: Number, default: 60 },
    description: String,
}, { timestamps: true }));
/** An academic term, e.g. "Odd Semester 2026-27". */
export const Semester = model('Semester', new Schema({
    name: { type: String, required: true, trim: true },
    academicYear: { type: String, required: true },
    type: { type: String, enum: ['odd', 'even', 'summer'], default: 'odd' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isCurrent: { type: Boolean, default: false, index: true },
}, { timestamps: true }));
export const Section = model('Section', new Schema({
    name: { type: String, required: true, trim: true, uppercase: true },
    program: { type: ObjectId, ref: 'Program', required: true },
    semesterNumber: { type: Number, required: true, min: 1, max: 12 },
    batch: String,
    classAdvisor: { type: ObjectId, ref: 'Faculty' },
    room: String,
    capacity: { type: Number, default: 60 },
}, { timestamps: true }).index({ program: 1, semesterNumber: 1, name: 1 }, { unique: true }));
export const Course = model('Course', new Schema({
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    title: { type: String, required: true, trim: true },
    credits: { type: Number, default: 3, min: 0 },
    type: { type: String, enum: ['Theory', 'Lab', 'Elective', 'Project'], default: 'Theory' },
    department: { type: ObjectId, ref: 'Department', required: true, index: true },
    program: { type: ObjectId, ref: 'Program', required: true, index: true },
    semesterNumber: { type: Number, required: true, min: 1, max: 12 },
    faculty: [{ type: ObjectId, ref: 'Faculty', index: true }],
    sections: [{ type: ObjectId, ref: 'Section', index: true }],
    description: String,
    syllabus: String,
}, { timestamps: true }).index({ title: 'text', code: 'text' }));
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const timetableSchema = new Schema({
    section: { type: ObjectId, ref: 'Section', required: true },
    course: { type: ObjectId, ref: 'Course', required: true },
    faculty: { type: ObjectId, ref: 'Faculty', required: true, index: true },
    day: { type: String, enum: DAYS, required: true },
    startTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    endTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    room: String,
    type: { type: String, enum: ['Lecture', 'Lab', 'Tutorial'], default: 'Lecture' },
}, { timestamps: true }).index({ section: 1, day: 1, startTime: 1 }, { unique: true });
timetableSchema.path('endTime').validate(function (end) {
    return !this.startTime || end > this.startTime;
}, 'End time must be after start time');
export const TimetableEntry = model('TimetableEntry', timetableSchema);
//# sourceMappingURL=academic.js.map