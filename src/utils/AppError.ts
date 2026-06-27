/**
 * Custom application error class for operational errors.
 * Extends the native Error with an HTTP status code and an isOperational flag
 * to differentiate expected errors (bad input, not found) from programming bugs.
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
