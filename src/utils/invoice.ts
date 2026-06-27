import PDFDocument from 'pdfkit';
import { IOrder } from '../models/Order';
import Counter from '../models/Counter';
import Invoice from '../models/Invoice';
import cloudinary from '../config/cloudinary';
import { env } from '../config/env';
import { Readable } from 'stream';
import { safeSubtract } from './helpers';

/**
 * Gets the current Indian financial year string (e.g., "2627" for FY 2026-27).
 */
const getFinancialYear = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  // Indian FY: April to March
  if (month >= 3) {
    // April onwards → current year to next year
    return `${year.toString().slice(2)}${(year + 1).toString().slice(2)}`;
  }
  // Jan-March → previous year to current year
  return `${(year - 1).toString().slice(2)}${year.toString().slice(2)}`;
};

/**
 * Generates the next sequential invoice ID for the current financial year.
 * Format: INV-2627/0001, INV-2627/0002, etc.
 */
export const generateInvoiceId = async (): Promise<string> => {
  const fy = getFinancialYear();
  const counterName = `invoice_${fy}`;

  const counter = await Counter.findOneAndUpdate(
    { name: counterName },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const seq = counter.seq.toString().padStart(4, '0');
  return `INV-${fy}/${seq}`;
};

/**
 * Generates a PDF invoice for an order and uploads it to Cloudinary.
 * Returns the Cloudinary URL of the uploaded PDF.
 * Handles multi-page tables gracefully — items overflow to new pages without breaking layout.
 */
export const generateInvoicePDF = async (order: IOrder, invoiceId: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', async () => {
      try {
        const pdfBuffer = Buffer.concat(chunks);

        // Upload to Cloudinary
        const uploadResult = await new Promise<any>((res, rej) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'ecommerce/invoices',
              resource_type: 'raw',
              public_id: invoiceId.replace(/\//g, '-'),
              format: 'pdf',
            },
            (error, result) => {
              if (error) rej(error);
              else res(result);
            }
          );
          const readable = Readable.from(pdfBuffer);
          readable.pipe(stream);
        });

        resolve(uploadResult.secure_url);
      } catch (err) {
        reject(err);
      }
    });

    doc.on('error', reject);

    // ─── PDF Content ─────────────────────────────────────────────────────────

    const pageWidth = doc.page.width - 80; // margins
    const leftMargin = 40;

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' });
    doc.moveDown(0.5);

    // Company info (left) and Invoice info (right)
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(env.COMPANY_NAME, leftMargin, doc.y);
    doc.font('Helvetica').fontSize(8);
    doc.text(env.COMPANY_ADDRESS);
    doc.text(env.COMPANY_CITY_STATE_PIN);
    doc.text(`GSTIN: ${env.COMPANY_GSTIN}`);
    doc.text(`Email: ${env.COMPANY_EMAIL} | Phone: ${env.COMPANY_PHONE}`);

    // Invoice details (right side)
    const invoiceInfoY = doc.y - 50;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(`Invoice No: ${invoiceId}`, 350, invoiceInfoY, { width: 200, align: 'right' });
    doc.font('Helvetica').fontSize(8);
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 350, doc.y, { width: 200, align: 'right' });
    doc.text(`Order ID: ${order.orderId}`, 350, doc.y, { width: 200, align: 'right' });

    doc.moveDown(1);
    const lineY = doc.y;
    doc.moveTo(leftMargin, lineY).lineTo(leftMargin + pageWidth, lineY).stroke();
    doc.moveDown(0.5);

    // Billing/Shipping Address
    doc.fontSize(9).font('Helvetica-Bold').text('Ship To:', leftMargin, doc.y);
    doc.font('Helvetica').fontSize(8);
    doc.text(order.shippingAddress.fullName);
    doc.text(order.shippingAddress.addressLine1);
    if (order.shippingAddress.addressLine2) doc.text(order.shippingAddress.addressLine2);
    doc.text(`${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`);
    doc.text(`Phone: ${order.shippingAddress.phone}`);

    doc.moveDown(1);
    const lineY2 = doc.y;
    doc.moveTo(leftMargin, lineY2).lineTo(leftMargin + pageWidth, lineY2).stroke();
    doc.moveDown(0.5);

    // ─── Items Table ─────────────────────────────────────────────────────────

    // Table header
    const tableTop = doc.y;
    const colWidths = {
      sno: 25,
      name: 140,
      qty: 30,
      rate: 60,
      taxable: 65,
      gst: 45,
      tax: 55,
      total: 60,
    };

    const drawTableHeader = (y: number) => {
      doc.fontSize(7).font('Helvetica-Bold');
      let x = leftMargin;
      doc.text('#', x, y, { width: colWidths.sno, align: 'center' }); x += colWidths.sno;
      doc.text('Item', x, y, { width: colWidths.name }); x += colWidths.name;
      doc.text('Qty', x, y, { width: colWidths.qty, align: 'center' }); x += colWidths.qty;
      doc.text('Rate', x, y, { width: colWidths.rate, align: 'right' }); x += colWidths.rate;
      doc.text('Taxable', x, y, { width: colWidths.taxable, align: 'right' }); x += colWidths.taxable;
      doc.text('GST%', x, y, { width: colWidths.gst, align: 'center' }); x += colWidths.gst;
      doc.text('Tax', x, y, { width: colWidths.tax, align: 'right' }); x += colWidths.tax;
      doc.text('Total', x, y, { width: colWidths.total, align: 'right' });

      const headerBottom = y + 12;
      doc.moveTo(leftMargin, headerBottom).lineTo(leftMargin + pageWidth, headerBottom).stroke();
      return headerBottom + 4;
    };

    let currentY = drawTableHeader(tableTop);

    // Table rows
    doc.font('Helvetica').fontSize(7);

    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      const taxableValue = safeSubtract(item.finalPrice, item.gstAmount);
      const rowHeight = 14;

      // Check if we need a new page
      if (currentY + rowHeight > doc.page.height - 150) {
        doc.addPage();
        currentY = drawTableHeader(40);
        doc.font('Helvetica').fontSize(7);
      }

      let x = leftMargin;
      doc.text(`${i + 1}`, x, currentY, { width: colWidths.sno, align: 'center' }); x += colWidths.sno;
      doc.text(`${item.productName} (${item.variantInfo})`, x, currentY, { width: colWidths.name }); x += colWidths.name;
      doc.text(`${item.quantity}`, x, currentY, { width: colWidths.qty, align: 'center' }); x += colWidths.qty;
      doc.text(`₹${item.price.toFixed(2)}`, x, currentY, { width: colWidths.rate, align: 'right' }); x += colWidths.rate;
      doc.text(`₹${taxableValue.toFixed(2)}`, x, currentY, { width: colWidths.taxable, align: 'right' }); x += colWidths.taxable;
      doc.text(`${item.gstRate}%`, x, currentY, { width: colWidths.gst, align: 'center' }); x += colWidths.gst;
      doc.text(`₹${item.gstAmount.toFixed(2)}`, x, currentY, { width: colWidths.tax, align: 'right' }); x += colWidths.tax;
      doc.text(`₹${item.finalPrice.toFixed(2)}`, x, currentY, { width: colWidths.total, align: 'right' });

      currentY += rowHeight;
    }

    // Table bottom line
    doc.moveTo(leftMargin, currentY + 2).lineTo(leftMargin + pageWidth, currentY + 2).stroke();
    currentY += 10;

    // ─── Tax Summary ─────────────────────────────────────────────────────────

    // Group by GST rate
    const taxGroups: Record<number, { taxable: number; tax: number }> = {};
    for (const item of order.items) {
      const taxableValue = safeSubtract(item.finalPrice, item.gstAmount);
      if (!taxGroups[item.gstRate]) taxGroups[item.gstRate] = { taxable: 0, tax: 0 };
      taxGroups[item.gstRate].taxable += taxableValue;
      taxGroups[item.gstRate].tax += item.gstAmount;
    }

    // Check for page break before summary
    if (currentY + 120 > doc.page.height - 40) {
      doc.addPage();
      currentY = 40;
    }

    doc.fontSize(8).font('Helvetica-Bold').text('Tax Summary:', leftMargin, currentY);
    currentY += 14;
    doc.font('Helvetica').fontSize(7);

    for (const [rate, values] of Object.entries(taxGroups)) {
      if (order.isInterState) {
        doc.text(`IGST @${rate}%: Taxable ₹${values.taxable.toFixed(2)} | Tax ₹${values.tax.toFixed(2)}`, leftMargin, currentY);
      } else {
        const half = values.tax / 2;
        doc.text(`CGST @${Number(rate) / 2}%: ₹${half.toFixed(2)} | SGST @${Number(rate) / 2}%: ₹${half.toFixed(2)} (Taxable: ₹${values.taxable.toFixed(2)})`, leftMargin, currentY);
      }
      currentY += 12;
    }

    currentY += 10;

    // ─── Order Totals ────────────────────────────────────────────────────────

    const totalsX = 350;
    const valuesX = 460;
    doc.fontSize(8).font('Helvetica');

    const addTotalLine = (label: string, value: string, bold = false) => {
      if (bold) doc.font('Helvetica-Bold');
      else doc.font('Helvetica');
      doc.text(label, totalsX, currentY);
      doc.text(value, valuesX, currentY, { width: 80, align: 'right' });
      currentY += 14;
    };

    addTotalLine('Subtotal:', `₹${order.subtotal.toFixed(2)}`);
    if (order.offerDiscount > 0) addTotalLine('Offer Discount:', `-₹${order.offerDiscount.toFixed(2)}`);
    if (order.couponDiscount > 0) addTotalLine(`Coupon (${order.couponCode}):`, `-₹${order.couponDiscount.toFixed(2)}`);
    if (order.walletAmountUsed > 0) addTotalLine('Wallet Used:', `-₹${order.walletAmountUsed.toFixed(2)}`);
    if (order.shippingCharge > 0) addTotalLine('Shipping:', `₹${order.shippingCharge.toFixed(2)}`);
    addTotalLine('Total Tax (incl.):', `₹${order.totalTax.toFixed(2)}`);

    currentY += 2;
    doc.moveTo(totalsX, currentY).lineTo(totalsX + 130, currentY).stroke();
    currentY += 6;
    addTotalLine('Grand Total:', `₹${order.totalAmount.toFixed(2)}`, true);

    // ─── Footer ──────────────────────────────────────────────────────────────

    currentY += 20;
    if (currentY + 40 > doc.page.height - 40) {
      doc.addPage();
      currentY = 40;
    }

    doc.fontSize(7).font('Helvetica').fillColor('#666666');
    doc.text('This is a computer-generated invoice and does not require a physical signature.', leftMargin, currentY);
    doc.text('For returns and refund policy, please visit our website.', leftMargin, currentY + 10);

    doc.end();
  });
};

/**
 * Creates an invoice record, generates the PDF, uploads to Cloudinary,
 * and returns the invoice document with the PDF URL.
 */
export const createInvoice = async (order: IOrder): Promise<{ invoiceId: string; pdfUrl: string }> => {
  const invoiceId = await generateInvoiceId();

  const pdfUrl = await generateInvoicePDF(order, invoiceId);

  await Invoice.create({
    invoiceId,
    order: order._id,
    user: order.user,
    invoiceDate: new Date(),
    pdfUrl,
    totalAmount: order.totalAmount,
    totalTax: order.totalTax,
  });

  return { invoiceId, pdfUrl };
};
