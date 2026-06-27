import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWalletTransaction extends Document {
  wallet: Types.ObjectId;
  user: Types.ObjectId;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  reference?: string;
  createdAt: Date;
}

const walletTransactionSchema = new Schema<IWalletTransaction>(
  {
    wallet: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, required: true },
    reference: { type: String },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ wallet: 1 });

export default mongoose.model<IWalletTransaction>('WalletTransaction', walletTransactionSchema);
