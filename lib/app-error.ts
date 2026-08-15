export class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, 400);
  }
}

export class AuthError extends AppError {
  constructor(message = '请先登录。') {
    super('AUTH_REQUIRED', message, 401);
  }
}

export class BillingError extends AppError {
  constructor(message = '点数不足。') {
    super('INSUFFICIENT_CREDITS', message, 402);
  }
}

export class UpstreamError extends AppError {
  constructor(message = '上游服务暂时不可用。') {
    super('UPSTREAM_FAILURE', message, 502);
  }
}

export function toClientError(error: unknown) {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  return { code: 'INTERNAL_ERROR', message: '服务器内部处理出错，请稍后重试。', status: 500 };
}
