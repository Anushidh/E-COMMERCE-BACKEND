import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ICategoryOffer extends Document {
  category: Types.ObjectId;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const categoryOfferSchema = new Schema<ICategoryOffer>(
  {
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    discountType: { type: String, enum: ['percentage', 'flat'], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

categoryOfferSchema.index({ category: 1, isDeleted: 1 });
categoryOfferSchema.index({ startDate: 1, endDate: 1 });

export default mongoose.model<ICategoryOffer>('CategoryOffer', categoryOfferSchema);
