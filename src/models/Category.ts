import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  description?: string;
  image?: string;
  gender: 'Men' | 'Women' | 'Both';
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String },
    image: { type: String },
    gender: { type: String, enum: ['Men', 'Women', 'Both'], default: 'Both' },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

categorySchema.index({ isDeleted: 1 });
categorySchema.index({ gender: 1 });

export default mongoose.model<ICategory>('Category', categorySchema);
