import bcrypt from 'bcryptjs';
import { Schema, model } from 'mongoose';
export const ROLES = ['admin', 'faculty', 'student'];
const userSchema = new Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false, minlength: 6 },
    role: { type: String, enum: ROLES, required: true, index: true },
    phone: { type: String, trim: true },
    avatar: { type: String },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
}, { timestamps: true });
userSchema.index({ name: 'text', email: 'text' });
userSchema.pre('save', async function () {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
});
userSchema.methods.comparePassword = function (candidate) {
    return bcrypt.compare(candidate, this.password);
};
userSchema.set('toJSON', {
    transform: (_doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
    },
});
export const User = model('User', userSchema);
const refreshTokenSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true },
    userAgent: String,
    expiresAt: { type: Date, required: true },
}, { timestamps: true });
// Expired refresh tokens are removed automatically by MongoDB.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshToken = model('RefreshToken', refreshTokenSchema);
//# sourceMappingURL=User.js.map