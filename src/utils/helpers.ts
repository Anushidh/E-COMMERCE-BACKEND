import crypto from 'crypto';
import Decimal from 'decimal.js';

export const generateOTP = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};

export const generateOrderId = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${timestamp}-${random}`;
};

/**
 * Calculate discount amount using Decimal.js to avoid floating point issues.
 * Returns the discount value (not the final price).
 * Percentage discounts are capped at 100% (discount cannot exceed item price).
 */
export const calculateDiscount = (
  price: number,
  discountType: 'percentage' | 'flat',
  discountValue: number
): number => {
  const decPrice = new Decimal(price);
  const decValue = new Decimal(discountValue);

  if (discountType === 'percentage') {
    // Cap percentage at 100%
    const cappedPercentage = Decimal.min(decValue, new Decimal(100));
    return decPrice.mul(cappedPercentage).div(100).toDecimalPlaces(2).toNumber();
  }
  // flat discount: cannot exceed the price
  return Decimal.min(decValue, decPrice).toDecimalPlaces(2).toNumber();
};

/**
 * Calculate coupon discount with optional max cap.
 */
export const calculateCouponDiscount = (
  orderTotal: number,
  discountType: 'percentage' | 'flat',
  discountValue: number,
  maxDiscount?: number
): number => {
  const decTotal = new Decimal(orderTotal);
  const decValue = new Decimal(discountValue);

  let discount: Decimal;

  if (discountType === 'percentage') {
    discount = decTotal.mul(decValue).div(100);
    if (maxDiscount !== undefined && maxDiscount > 0) {
      discount = Decimal.min(discount, new Decimal(maxDiscount));
    }
  } else {
    discount = Decimal.min(decValue, decTotal);
  }

  return discount.toDecimalPlaces(2).toNumber();
};

/**
 * Multiply price × quantity safely.
 */
export const safeMultiply = (a: number, b: number): number => {
  return new Decimal(a).mul(new Decimal(b)).toDecimalPlaces(2).toNumber();
};

/**
 * Add two monetary values safely.
 */
export const safeAdd = (a: number, b: number): number => {
  return new Decimal(a).plus(new Decimal(b)).toDecimalPlaces(2).toNumber();
};

/**
 * Subtract two monetary values safely.
 */
export const safeSubtract = (a: number, b: number): number => {
  return new Decimal(a).minus(new Decimal(b)).toDecimalPlaces(2).toNumber();
};

/**
 * Sum an array of numbers safely.
 */
export const safeSum = (values: number[]): number => {
  return values
    .reduce((acc, val) => acc.plus(new Decimal(val)), new Decimal(0))
    .toDecimalPlaces(2)
    .toNumber();
};

export const paginationHelper = (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  return { skip, limit };
};

/**
 * Calculates delivery charge based on order subtotal (after discounts).
 * Free delivery if subtotal >= threshold, otherwise flat delivery charge.
 * Both values are configurable via environment variables.
 */
export const calculateDeliveryCharge = (orderSubtotalAfterDiscounts: number, freeThreshold: number, flatCharge: number): number => {
  if (orderSubtotalAfterDiscounts >= freeThreshold) return 0;
  return flatCharge;
};

export interface TaxBreakdown {
  gstRate: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
}

/**
 * Calculates GST breakdown for a line item (price is inclusive of GST / MRP-based).
 * Formula: taxableValue = finalPrice / (1 + gstRate/100), gstAmount = finalPrice - taxableValue
 * Splits into CGST+SGST (intra-state) or IGST (inter-state).
 */
export const calculateGST = (
  finalPrice: number,
  gstRate: number,
  isInterState: boolean
): TaxBreakdown => {
  const decFinal = new Decimal(finalPrice);
  const decRate = new Decimal(gstRate);

  // GST inclusive: extract tax from MRP
  const taxableValue = decFinal.div(decRate.div(100).plus(1));
  const gstAmount = decFinal.minus(taxableValue).toDecimalPlaces(2).toNumber();

  if (isInterState) {
    return {
      gstRate,
      gstAmount,
      cgst: 0,
      sgst: 0,
      igst: gstAmount,
    };
  }

  // Intra-state: split equally into CGST and SGST
  const half = new Decimal(gstAmount).div(2).toDecimalPlaces(2).toNumber();
  return {
    gstRate,
    gstAmount,
    cgst: half,
    sgst: half,
    igst: 0,
  };
};
