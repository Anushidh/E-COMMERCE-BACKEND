import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWallet extends Document {
  user: Types.ObjectId;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

const walletSchema = new Schema<IWallet>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

walletSchema.index({ user: 1 });

export default mongoose.model<IWallet>('Wallet', walletSchema);
