export class AppError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}

export class ConflictError extends AppError {
  constructor(msg: string) {
    super(409, "CONFLICT", msg);
  }
}

export class UnauthorizedError extends AppError {
  constructor(msg: string) {
    super(401, "UNAUTHORIZED", msg);
  }
}

export class NotFoundError extends AppError {
  constructor(msg: string) {
    super(404, "NOT_FOUND", msg);
  }
}

export class ForbiddenError extends AppError {
  constructor(msg: string) {
    super(403, "FORBIDDEN", msg);
  }
}

export class ValidationError extends AppError {
  constructor(msg: string) {
    super(422, "VALIDATION_ERROR", msg);
  }
}
