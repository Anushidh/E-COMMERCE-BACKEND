import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IVariant extends Document {
  product: Types.ObjectId;
  size: string;
  color: string;
  stock: number;
  sku?: string;
  price?: number; // Override base price if set
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const variantSchema = new Schema<IVariant>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    size: { type: String, required: true },
    color: { type: String, required: true },
    stock: { type: Number, required: true, min: 0, default: 0 },
    sku: { type: String },
    price: { type: Number, min: 0 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

variantSchema.index({ product: 1, size: 1, color: 1 }, { unique: true });
variantSchema.index({ product: 1, isDeleted: 1 });
variantSchema.index({ stock: 1 });

export default mongoose.model<IVariant>('Variant', variantSchema);
