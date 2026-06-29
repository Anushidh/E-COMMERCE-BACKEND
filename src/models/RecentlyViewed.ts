import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRecentlyViewed extends Document {
  user: Types.ObjectId;
  products: { product: Types.ObjectId; viewedAt: Date }[];
}

/**
 * Stores the last 20 products viewed by each user.
 * Used for "Recently Viewed" sections on the frontend.
 */
const recentlyViewedSchema = new Schema<IRecentlyViewed>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    products: [
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        viewedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<IRecentlyViewed>('RecentlyViewed', recentlyViewedSchema);
