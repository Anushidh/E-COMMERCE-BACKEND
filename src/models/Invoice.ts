import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInvoice extends Document {
  invoiceId: string;
  order: Types.ObjectId;
  user: Types.ObjectId;
  invoiceDate: Date;
  pdfUrl?: string;
  totalAmount: number;
  totalTax: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Invoice model — stores generated invoice metadata.
 * invoiceId follows a sequential, financial-year-based format (e.g., INV-2627/0001)
 * for GST compliance.
 */
const invoiceSchema = new Schema<IInvoice>(
  {
    invoiceId: { type: String, required: true, unique: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    invoiceDate: { type: Date, required: true, default: Date.now },
    pdfUrl: { type: String },
    totalAmount: { type: Number, required: true },
    totalTax: { type: Number, required: true },
  },
  { timestamps: true }
);

invoiceSchema.index({ order: 1 });
invoiceSchema.index({ user: 1 });
invoiceSchema.index({ invoiceId: 1 });

export default mongoose.model<IInvoice>('Invoice', invoiceSchema);
