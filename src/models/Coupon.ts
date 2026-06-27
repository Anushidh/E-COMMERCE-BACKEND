import mongoose, { Schema, Document } from 'mongoose';

export interface ICoupon extends Document {
  code: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
  usageLimitPerUser: number;
  totalUsageLimit: number;
  totalUsed: number;
  expiryDate: Date;
  isActive: boolean;
  isDeleted: boolean;
  usedBy: { user: mongoose.Types.ObjectId; count: number }[];
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountType: { type: String, enum: ['percentage', 'flat'], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0 },
    maxDiscount: { type: Number },
    usageLimitPerUser: { type: Number, default: 1 },
    totalUsageLimit: { type: Number, required: true },
    totalUsed: { type: Number, default: 0 },
    expiryDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    usedBy: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        count: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

couponSchema.index({ code: 1, isDeleted: 1 });
couponSchema.index({ expiryDate: 1 });

export default mongoose.model<ICoupon>('Coupon', couponSchema);
