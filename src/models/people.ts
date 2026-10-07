import { Schema, model, type InferSchemaType } from 'mongoose';

const { ObjectId } = Schema.Types;

const studentSchema = new Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, unique: true },
    enrollmentNo: { type: String, required: true, unique: true, trim: true, uppercase: true },
    rollNo: { type: String, trim: true },
    department: { type: ObjectId, ref: 'Department', required: true, index: true },
    program: { type: ObjectId, ref: 'Program', required: true, index: true },
    section: { type: ObjectId, ref: 'Section', index: true },
    currentSemester: { type: Number, min: 1, max: 12, default: 1 },
    batch: { type: String, trim: true },
    dob: Date,
    gender: { type: String, enum: ['male', 'female', 'other'] },
    bloodGroup: String,
    address: String,
    guardian: {
      name: String,
      relation: String,
      phone: String,
    },
    admissionDate: Date,
    status: {
      type: String,
      enum: ['active', 'graduated', 'suspended', 'dropped'],
      default: 'active',
      index: true,
    },
    cgpa: { type: Number, min: 0, max: 10, default: 0 },
    transportRoute: { type: ObjectId, ref: 'TransportRoute' },
  },
  { timestamps: true },
);
studentSchema.index({ program: 1, currentSemester: 1, section: 1 });

export type IStudent = InferSchemaType<typeof studentSchema>;
export const Student = model('Student', studentSchema);

const facultySchema = new Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, unique: true },
    employeeId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    department: { type: ObjectId, ref: 'Department', required: true, index: true },
    designation: {
      type: String,
      enum: ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Lab Instructor'],
      default: 'Assistant Professor',
    },
    qualification: String,
    specialization: String,
    experienceYears: { type: Number, default: 0 },
    joiningDate: Date,
    officeRoom: String,
    status: { type: String, enum: ['active', 'on-leave', 'inactive'], default: 'active' },
  },
  { timestamps: true },
);

export type IFaculty = InferSchemaType<typeof facultySchema>;
export const Faculty = model('Faculty', facultySchema);
