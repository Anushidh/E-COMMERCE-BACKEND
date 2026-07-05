import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; path: string }[];
}

/**
 * Shared email header and footer used across all transactional emails.
 */
const emailHeader = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
    <div style="background: #18181b; padding: 20px 32px;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">WEARHAUS</h1>
    </div>
    <div style="padding: 32px;">
`;

const emailFooter = `
    </div>
    <div style="background: #f4f4f5; padding: 16px 32px; text-align: center;">
      <p style="color: #6b7280; font-size: 12px; margin: 0;">
        © ${new Date().getFullYear()} Wearhaus. All rights reserved.
      </p>
      <p style="color: #9ca3af; font-size: 11px; margin: 4px 0 0;">
        ${env.COMPANY_ADDRESS}, ${env.COMPANY_CITY_STATE_PIN}
      </p>
    </div>
  </div>
`;

/** Sends an email using the configured SMTP transporter. Supports optional file attachments. */
export const sendEmail = async (options: EmailOptions): Promise<void> => {
  await transporter.sendMail({
    from: `"Wearhaus" <${env.FROM_EMAIL}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments,
  });
};

/** Sends an OTP verification email for signup or password reset. */
export const sendOTPEmail = async (email: string, otp: string, type: string): Promise<void> => {
  const subject = type === 'signup' ? 'Verify Your Email — Wearhaus' : 'Reset Your Password — Wearhaus';
  const title = type === 'signup' ? 'Verify your email address' : 'Reset your password';
  const html = `
    ${emailHeader}
      <h2 style="color: #18181b; margin-top: 0;">${title}</h2>
      <p style="color: #374151;">Use the OTP below to continue. It expires in <strong>5 minutes</strong>.</p>
      <div style="text-align: center; margin: 32px 0;">
        <span style="display: inline-block; background: #f4f4f5; color: #18181b; font-size: 36px; font-weight: bold; letter-spacing: 12px; padding: 16px 32px; border-radius: 8px;">${otp}</span>
      </div>
      <p style="color: #6b7280; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
    ${emailFooter}
  `;
  await sendEmail({ to: email, subject, html });
};

/** Sends an order confirmation email after successful placement. */
export const sendOrderConfirmationEmail = async (
  email: string,
  orderId: string,
  totalAmount: number
): Promise<void> => {
  const html = `
    ${emailHeader}
      <h2 style="color: #18181b; margin-top: 0;">Order Confirmed! 🎉</h2>
      <p style="color: #374151;">Thanks for shopping with Wearhaus. Your order has been placed successfully.</p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px;"><span style="color: #6b7280;">Order ID:</span> <strong>${orderId}</strong></p>
        <p style="margin: 0;"><span style="color: #6b7280;">Total Amount:</span> <strong>₹${totalAmount}</strong></p>
      </div>
      <p style="color: #374151;">You can track your order anytime from your account.</p>
    ${emailFooter}
  `;
  await sendEmail({ to: email, subject: `Order Confirmed — ${orderId} | Wearhaus`, html });
};

/** Sends an email notifying the user about an order status change. */
export const sendOrderStatusEmail = async (
  email: string,
  orderId: string,
  status: string
): Promise<void> => {
  const statusMessages: Record<string, string> = {
    Confirmed: 'Your order has been confirmed and is being prepared.',
    Shipped: 'Great news — your order is on its way!',
    'Out for Delivery': 'Your order is out for delivery. Expect it today!',
    Delivered: 'Your order has been delivered. Enjoy your new wear!',
    Cancelled: 'Your order has been cancelled as requested.',
    Returned: 'Your return has been processed successfully.',
  };
  const message = statusMessages[status] || `Your order status has been updated to <strong>${status}</strong>.`;

  const html = `
    ${emailHeader}
      <h2 style="color: #18181b; margin-top: 0;">Order Update</h2>
      <p style="color: #374151;">${message}</p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px;"><span style="color: #6b7280;">Order ID:</span> <strong>${orderId}</strong></p>
        <p style="margin: 0;"><span style="color: #6b7280;">Status:</span> <strong style="color: #4F46E5;">${status}</strong></p>
      </div>
      <p style="color: #374151;">Log in to your account to view full order details.</p>
    ${emailFooter}
  `;
  await sendEmail({ to: email, subject: `Your order is ${status} — ${orderId} | Wearhaus`, html });
};

/** Sends a refund confirmation email when money is credited back to wallet. */
export const sendRefundEmail = async (
  email: string,
  orderId: string,
  amount: number
): Promise<void> => {
  const html = `
    ${emailHeader}
      <h2 style="color: #18181b; margin-top: 0;">Refund Processed</h2>
      <p style="color: #374151;">Your refund has been credited to your Wearhaus wallet.</p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px;"><span style="color: #6b7280;">Order ID:</span> <strong>${orderId}</strong></p>
        <p style="margin: 0;"><span style="color: #6b7280;">Refund Amount:</span> <strong style="color: #16a34a;">₹${amount}</strong></p>
      </div>
      <p style="color: #374151;">The amount is available in your wallet and can be used on your next order.</p>
    ${emailFooter}
  `;
  await sendEmail({ to: email, subject: `Refund of ₹${amount} Processed — ${orderId} | Wearhaus`, html });
};

/** Sends the invoice PDF as an email attachment to the customer. */
export const sendInvoiceEmail = async (
  email: string,
  orderId: string,
  invoiceId: string,
  pdfUrl: string
): Promise<void> => {
  const html = `
    ${emailHeader}
      <h2 style="color: #18181b; margin-top: 0;">Your Invoice is Ready</h2>
      <p style="color: #374151;">Please find your invoice attached to this email.</p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px;"><span style="color: #6b7280;">Order ID:</span> <strong>${orderId}</strong></p>
        <p style="margin: 0;"><span style="color: #6b7280;">Invoice ID:</span> <strong>${invoiceId}</strong></p>
      </div>
      <p style="color: #374151;">You can also <a href="${pdfUrl}" style="color: #4F46E5;">download it here</a>.</p>
      <p style="color: #374151;">Thank you for shopping with Wearhaus! 🛍️</p>
    ${emailFooter}
  `;
  await sendEmail({
    to: email,
    subject: `Invoice ${invoiceId} — Order ${orderId} | Wearhaus`,
    html,
    attachments: [{ filename: `${invoiceId.replace(/\//g, '-')}.pdf`, path: pdfUrl }],
  });
};
