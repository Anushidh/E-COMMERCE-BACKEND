import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IOrderItem {
  product: Types.ObjectId;
  variant: Types.ObjectId;
  productName: string;
  variantInfo: string;
  quantity: number;
  price: number;
  offerDiscount: number;
  finalPrice: number;
  taxableValue: number;
  gstRate: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface IStatusHistory {
  status: string;
  timestamp: Date;
  note?: string;
}

export interface IOrder extends Document {
  orderId: string;
  user: Types.ObjectId;
  items: IOrderItem[];
  shippingAddress: {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  subtotal: number;
  offerDiscount: number;
  couponDiscount: number;
  couponCode?: string;
  walletAmountUsed: number;
  shippingCharge: number;
  totalTax: number;
  isInterState: boolean;
  totalAmount: number;
  paymentMethod: 'razorpay' | 'cod' | 'wallet';
  paymentStatus: 'Pending' | 'Paid' | 'Failed' | 'Refunded';
  orderStatus: 'Placed' | 'Confirmed' | 'Shipped' | 'Out for Delivery' | 'Delivered' | 'Cancelled' | 'Return Requested' | 'Returned';
  statusHistory: IStatusHistory[];
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  cancelReason?: string;
  returnReason?: string;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variant: { type: Schema.Types.ObjectId, ref: 'Variant', required: true },
    productName: { type: String, required: true },
    variantInfo: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    offerDiscount: { type: Number, default: 0 },
    finalPrice: { type: Number, required: true },
    taxableValue: { type: Number, required: true, default: 0 },
    gstRate: { type: Number, required: true, default: 18 },
    gstAmount: { type: Number, required: true, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
  },
  { _id: true }
);

const orderSchema = new Schema<IOrder>(
  {
    orderId: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [orderItemSchema],
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      addressLine1: { type: String, required: true },
      addressLine2: { type: String },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      country: { type: String, default: 'India' },
    },
    subtotal: { type: Number, required: true },
    offerDiscount: { type: Number, default: 0 },
    couponDiscount: { type: Number, default: 0 },
    couponCode: { type: String },
    walletAmountUsed: { type: Number, default: 0 },
    shippingCharge: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    isInterState: { type: Boolean, default: false },
    totalAmount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['razorpay', 'cod', 'wallet'], required: true },
    paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Failed', 'Refunded'], default: 'Pending' },
    orderStatus: {
      type: String,
      enum: ['Placed', 'Confirmed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Return Requested', 'Returned'],
      default: 'Placed',
    },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    statusHistory: [
      {
        status: { type: String, required: true },
        timestamp: { type: Date, required: true, default: Date.now },
        note: { type: String },
      },
    ],
    cancelReason: { type: String },
    returnReason: { type: String },
    deliveredAt: { type: Date },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });

export default mongoose.model<IOrder>('Order', orderSchema);
