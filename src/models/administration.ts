import { Schema, model } from 'mongoose';

const { ObjectId } = Schema.Types;

const fileSchema = new Schema(
  { name: String, url: String, size: Number, mimeType: String },
  { _id: false },
);

export const FEE_CATEGORIES = ['Tuition', 'Hostel', 'Transport', 'Examination', 'Library', 'Other'] as const;

export const Fee = model(
  'Fee',
  new Schema(
    {
      student: { type: ObjectId, ref: 'Student', required: true, index: true },
      title: { type: String, required: true },
      category: { type: String, enum: FEE_CATEGORIES, default: 'Tuition', index: true },
      amount: { type: Number, required: true, min: 0 },
      paidAmount: { type: Number, default: 0 },
      dueDate: { type: Date, required: true },
      academicYear: String,
      semesterNumber: Number,
      status: {
        type: String,
        enum: ['pending', 'partial', 'paid', 'overdue', 'waived'],
        default: 'pending',
        index: true,
      },
      payments: [
        {
          amount: Number,
          paidAt: { type: Date, default: Date.now },
          method: { type: String, enum: ['online', 'card', 'upi', 'cash', 'bank-transfer'] },
          transactionId: String,
        },
      ],
    },
    { timestamps: true },
  ),
);

export const Holiday = model(
  'Holiday',
  new Schema(
    {
      title: { type: String, required: true, trim: true },
      date: { type: Date, required: true, index: true },
      endDate: Date,
      type: { type: String, enum: ['National', 'Religious', 'University', 'Vacation'], default: 'University' },
      description: String,
    },
    { timestamps: true },
  ),
);

export const Event = model(
  'Event',
  new Schema(
    {
      title: { type: String, required: true, trim: true },
      description: String,
      category: {
        type: String,
        enum: ['Academic', 'Cultural', 'Sports', 'Workshop', 'Seminar', 'Placement', 'Other'],
        default: 'Academic',
      },
      startDate: { type: Date, required: true, index: true },
      endDate: Date,
      venue: String,
      organizer: String,
      image: String,
      registrationLink: String,
    },
    { timestamps: true },
  ),
);

export const Circular = model(
  'Circular',
  new Schema(
    {
      title: { type: String, required: true, trim: true },
      content: { type: String, required: true },
      referenceNo: String,
      audience: { type: String, enum: ['all', 'students', 'faculty'], default: 'all', index: true },
      department: { type: ObjectId, ref: 'Department' },
      priority: { type: String, enum: ['normal', 'important', 'urgent'], default: 'normal' },
      attachments: [fileSchema],
      publishedBy: { type: ObjectId, ref: 'User' },
      publishedAt: { type: Date, default: Date.now, index: true },
    },
    { timestamps: true },
  ),
);

export const Notification = model(
  'Notification',
  new Schema(
    {
      user: { type: ObjectId, ref: 'User', required: true },
      title: { type: String, required: true },
      message: String,
      type: {
        type: String,
        enum: ['info', 'assignment', 'attendance', 'exam', 'result', 'fee', 'circular', 'event', 'leave', 'request'],
        default: 'info',
      },
      link: String,
      read: { type: Boolean, default: false },
    },
    { timestamps: true },
  ).index({ user: 1, read: 1, createdAt: -1 }),
);

export const Document = model(
  'Document',
  new Schema(
    {
      title: { type: String, required: true, trim: true },
      category: {
        type: String,
        enum: ['Certificate', 'Marksheet', 'ID Card', 'Form', 'Syllabus', 'Handbook', 'Other'],
        default: 'Other',
      },
      description: String,
      file: { type: fileSchema, required: true },
      /** When set, only this user (and admins) can see it; otherwise it is visible to `audience`. */
      owner: { type: ObjectId, ref: 'User', index: true },
      audience: { type: String, enum: ['all', 'students', 'faculty'], default: 'all' },
      uploadedBy: { type: ObjectId, ref: 'User' },
    },
    { timestamps: true },
  ),
);

export const LeaveRequest = model(
  'LeaveRequest',
  new Schema(
    {
      requester: { type: ObjectId, ref: 'User', required: true, index: true },
      role: { type: String, enum: ['student', 'faculty'], required: true },
      student: { type: ObjectId, ref: 'Student' },
      type: { type: String, enum: ['Medical', 'Personal', 'On Duty', 'Emergency', 'Other'], default: 'Personal' },
      fromDate: { type: Date, required: true },
      toDate: { type: Date, required: true },
      reason: { type: String, required: true },
      attachment: fileSchema,
      status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true },
      reviewedBy: { type: ObjectId, ref: 'User' },
      reviewRemarks: String,
      reviewedAt: Date,
    },
    { timestamps: true },
  ),
);

export const REQUEST_TYPES = [
  'Bonafide Certificate',
  'Transcript',
  'ID Card Reissue',
  'Migration Certificate',
  'Name Correction',
  'Fee Receipt',
  'Other',
] as const;

export const UniversityRequest = model(
  'UniversityRequest',
  new Schema(
    {
      requester: { type: ObjectId, ref: 'User', required: true, index: true },
      student: { type: ObjectId, ref: 'Student' },
      type: { type: String, enum: REQUEST_TYPES, required: true },
      subject: { type: String, required: true },
      description: String,
      status: { type: String, enum: ['open', 'in-progress', 'resolved', 'rejected'], default: 'open', index: true },
      response: String,
      handledBy: { type: ObjectId, ref: 'User' },
      resolvedAt: Date,
    },
    { timestamps: true },
  ),
);

export const Placement = model(
  'Placement',
  new Schema(
    {
      company: { type: String, required: true, trim: true },
      jobRole: { type: String, required: true },
      packageLPA: { type: Number, default: 0 },
      driveDate: { type: Date, required: true },
      location: String,
      eligiblePrograms: [{ type: ObjectId, ref: 'Program' }],
      minCgpa: { type: Number, default: 0 },
      description: String,
      status: { type: String, enum: ['upcoming', 'ongoing', 'completed'], default: 'upcoming', index: true },
      selectedStudents: [{ type: ObjectId, ref: 'Student' }],
    },
    { timestamps: true },
  ),
);

export const Book = model(
  'Book',
  new Schema(
    {
      title: { type: String, required: true, trim: true },
      author: { type: String, required: true },
      isbn: { type: String, unique: true, sparse: true },
      publisher: String,
      category: String,
      totalCopies: { type: Number, default: 1, min: 0 },
      availableCopies: { type: Number, default: 1, min: 0 },
      shelf: String,
    },
    { timestamps: true },
  ).index({ title: 'text', author: 'text' }),
);

export const BookIssue = model(
  'BookIssue',
  new Schema(
    {
      book: { type: ObjectId, ref: 'Book', required: true },
      student: { type: ObjectId, ref: 'Student', required: true, index: true },
      issueDate: { type: Date, default: Date.now },
      dueDate: { type: Date, required: true },
      returnDate: Date,
      fine: { type: Number, default: 0 },
      status: { type: String, enum: ['issued', 'returned', 'lost'], default: 'issued', index: true },
    },
    { timestamps: true },
  ),
);

export const Hostel = model(
  'Hostel',
  new Schema(
    {
      name: { type: String, required: true, unique: true },
      type: { type: String, enum: ['Boys', 'Girls', 'Co-ed'], default: 'Boys' },
      warden: String,
      contact: String,
      totalRooms: { type: Number, default: 0 },
      capacity: { type: Number, default: 0 },
      feePerSemester: { type: Number, default: 0 },
      address: String,
    },
    { timestamps: true },
  ),
);

export const HostelAllocation = model(
  'HostelAllocation',
  new Schema(
    {
      hostel: { type: ObjectId, ref: 'Hostel', required: true, index: true },
      student: { type: ObjectId, ref: 'Student', required: true, index: true },
      roomNo: { type: String, required: true },
      fromDate: { type: Date, default: Date.now },
      toDate: Date,
      status: { type: String, enum: ['active', 'vacated'], default: 'active' },
    },
    { timestamps: true },
  ),
);

export const TransportRoute = model(
  'TransportRoute',
  new Schema(
    {
      routeNo: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      vehicleNo: String,
      driverName: String,
      driverPhone: String,
      capacity: { type: Number, default: 40 },
      fee: { type: Number, default: 0 },
      stops: [{ _id: false, name: String, time: String }],
    },
    { timestamps: true },
  ),
);

export const Settings = model(
  'Settings',
  new Schema(
    {
      key: { type: String, default: 'global', unique: true },
      universityName: { type: String, default: 'Northbridge University' },
      shortName: { type: String, default: 'NBU' },
      logo: String,
      address: String,
      email: String,
      phone: String,
      website: String,
      currentAcademicYear: String,
      currentSemester: { type: ObjectId, ref: 'Semester' },
      attendanceThreshold: { type: Number, default: 75 },
      lateFeePerDay: { type: Number, default: 50 },
      libraryFinePerDay: { type: Number, default: 5 },
      maxBooksPerStudent: { type: Number, default: 4 },
      allowStudentLeaveRequests: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);
