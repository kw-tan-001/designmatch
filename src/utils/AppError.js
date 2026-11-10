'use strict';

/**
 * Business-rule error raised by Control classes. The Boundary layer turns it
 * into an HTTP response with the given status code and message.
 */
class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    if (details) this.details = details;
  }

  static badRequest(message, details) { return new AppError(400, message, details); }
  static unauthorized(message = 'Please log in to continue.') { return new AppError(401, message); }
  static forbidden(message = 'You do not have permission to perform this action.') { return new AppError(403, message); }
  static notFound(message = 'Not found.') { return new AppError(404, message); }
  static conflict(message) { return new AppError(409, message); }
}

module.exports = AppError;
