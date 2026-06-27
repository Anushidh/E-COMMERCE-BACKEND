import mongoose, { Schema, Document } from 'mongoose';

export interface IOTPRecord extends Document {
  email: string;
  otp: string;
  type: 'signup' | 'forgot_password' | 'resend';
  expiresAt: Date;
  attempts: number;
  lastSentAt: Date;
  createdAt: Date;
}

const otpRecordSchema = new Schema<IOTPRecord>(
  {
    email: { type: String, required: true, lowercase: true },
    otp: { type: String, required: true },
    type: { type: String, enum: ['signup', 'forgot_password', 'resend'], required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

otpRecordSchema.index({ email: 1, type: 1 });
otpRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IOTPRecord>('OTPRecord', otpRecordSchema);
