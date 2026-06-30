import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWalletTopup extends Document {
  user: Types.ObjectId;
  razorpayOrderId: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const walletTopupSchema = new Schema<IWalletTopup>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    razorpayOrderId: { type: String, required: true, unique: true },
    amount: { type: Number, required: true, min: 10 },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  },
  { timestamps: true }
);

walletTopupSchema.index({ user: 1, status: 1 });
walletTopupSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 * 7 }); // Auto-cleanup after 7 days

export default mongoose.model<IWalletTopup>('WalletTopup', walletTopupSchema);
