import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IProductOffer extends Document {
  product: Types.ObjectId;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productOfferSchema = new Schema<IProductOffer>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    discountType: { type: String, enum: ['percentage', 'flat'], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

productOfferSchema.index({ product: 1, isDeleted: 1 });
productOfferSchema.index({ startDate: 1, endDate: 1 });

export default mongoose.model<IProductOffer>('ProductOffer', productOfferSchema);
