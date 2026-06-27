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

/** Sends an email using the configured SMTP transporter. Supports optional file attachments. */
export const sendEmail = async (options: EmailOptions): Promise<void> => {
  await transporter.sendMail({
    from: `"E-Commerce" <${env.FROM_EMAIL}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments,
  });
};

/** Sends an OTP verification email for signup or password reset. */
export const sendOTPEmail = async (email: string, otp: string, type: string): Promise<void> => {
  const subject = type === 'signup' ? 'Verify Your Email' : 'Reset Your Password';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${subject}</h2>
      <p>Your OTP is:</p>
      <h1 style="color: #4F46E5; letter-spacing: 5px;">${otp}</h1>
      <p>This OTP expires in 5 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    </div>
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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Order Confirmed! 🎉</h2>
      <p>Your order <strong>${orderId}</strong> has been placed successfully.</p>
      <p>Total Amount: <strong>₹${totalAmount}</strong></p>
      <p>You can track your order in your account.</p>
    </div>
  `;
  await sendEmail({ to: email, subject: `Order Confirmed - ${orderId}`, html });
};

/** Sends an email notifying the user about an order status change. */
export const sendOrderStatusEmail = async (
  email: string,
  orderId: string,
  status: string
): Promise<void> => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Order Update</h2>
      <p>Your order <strong>${orderId}</strong> status has been updated to: <strong>${status}</strong></p>
    </div>
  `;
  await sendEmail({ to: email, subject: `Order ${orderId} - ${status}`, html });
};

/** Sends a refund confirmation email when money is credited back to wallet. */
export const sendRefundEmail = async (
  email: string,
  orderId: string,
  amount: number
): Promise<void> => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Refund Processed</h2>
      <p>A refund of <strong>₹${amount}</strong> for order <strong>${orderId}</strong> has been credited to your wallet.</p>
    </div>
  `;
  await sendEmail({ to: email, subject: `Refund Processed - ${orderId}`, html });
};

/** Sends the invoice PDF as an email attachment to the customer. */
export const sendInvoiceEmail = async (
  email: string,
  orderId: string,
  invoiceId: string,
  pdfUrl: string
): Promise<void> => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Your Invoice is Ready</h2>
      <p>Invoice <strong>${invoiceId}</strong> for order <strong>${orderId}</strong> is attached.</p>
      <p>You can also <a href="${pdfUrl}">download it here</a>.</p>
      <p>Thank you for shopping with us!</p>
    </div>
  `;
  await sendEmail({
    to: email,
    subject: `Invoice ${invoiceId} - Order ${orderId}`,
    html,
    attachments: [{ filename: `${invoiceId.replace(/\//g, '-')}.pdf`, path: pdfUrl }],
  });
};
