import mongoose, { Schema, Document } from 'mongoose';

export interface ICounter extends Document {
  name: string;
  seq: number;
}

/**
 * Counter model — used for generating sequential IDs (e.g., invoice numbers).
 * Uses findOneAndUpdate with $inc for atomic incrementing.
 */
const counterSchema = new Schema<ICounter>({
  name: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

export default mongoose.model<ICounter>('Counter', counterSchema);
