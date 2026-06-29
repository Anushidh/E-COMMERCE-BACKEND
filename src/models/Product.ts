import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  slug: string;
  description: string;
  brand?: string;
  category: Types.ObjectId;
  gender: 'Men' | 'Women' | 'Unisex';
  images: string[];
  basePrice: number;
  gstRate: number;
  status: 'Active' | 'Inactive' | 'Out of Stock';
  averageRating: number;
  totalReviews: number;
  totalSold: number;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    description: { type: String, required: true },
    brand: { type: String },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    gender: { type: String, enum: ['Men', 'Women', 'Unisex'], required: true },
    images: [{ type: String }],
    basePrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, required: true, enum: [0, 5, 12, 18, 28], default: 18 },
    status: { type: String, enum: ['Active', 'Inactive', 'Out of Stock'], default: 'Active' },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0 },
    totalSold: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', description: 'text', brand: 'text' });
productSchema.index({ category: 1, isDeleted: 1 });
productSchema.index({ gender: 1, isDeleted: 1 });
productSchema.index({ status: 1, isDeleted: 1 });
productSchema.index({ basePrice: 1 });
productSchema.index({ averageRating: -1 });
productSchema.index({ totalSold: -1 });
productSchema.index({ createdAt: -1 });

/**
 * Auto-generates a URL-friendly slug from the product name before saving.
 * Appends a random suffix to avoid collisions on duplicate names.
 */
productSchema.pre('save', function (next) {
  if (this.isModified('name') || !this.slug) {
    const base = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    const suffix = Math.random().toString(36).slice(2, 7);
    this.slug = `${base}-${suffix}`;
  }
  next();
});

export default mongoose.model<IProduct>('Product', productSchema);
