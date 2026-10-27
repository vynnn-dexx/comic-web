export class AppError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  SOURCE_NOT_FOUND: "SOURCE_NOT_FOUND",
  SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE",
  SOURCE_TIMEOUT: "SOURCE_TIMEOUT",
  RATE_LIMITED: "RATE_LIMITED",
  DATABASE_ERROR: "DATABASE_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR"
};

export function createErrorResponse(code, message) {
  return {
    success: false,
    data: null,
    error: {
      code: String(code || "ERROR"),
      message: String(message || "An error occurred")
    },
    message: String(message || "An error occurred")
  };
}
