import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IReferral extends Document {
  referrer: Types.ObjectId;
  referee: Types.ObjectId;
  status: 'Pending' | 'Rewarded';
  rewardAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const referralSchema = new Schema<IReferral>(
  {
    referrer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    referee: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['Pending', 'Rewarded'], default: 'Pending' },
    rewardAmount: { type: Number, required: true },
  },
  { timestamps: true }
);

referralSchema.index({ referrer: 1 });
referralSchema.index({ referee: 1 }, { unique: true });

export default mongoose.model<IReferral>('Referral', referralSchema);
