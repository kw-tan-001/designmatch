'use strict';

/**
 * Boundary middleware for authentication and role-based access control.
 * The session only stores the account id; the account is re-validated through
 * AuthenticateSessionController on every request, so suspensions take effect
 * immediately (stories 2 and 15).
 */
const AppError = require('../utils/AppError');
const { AuthenticateSessionController } = require('../control/auth/AuthControllers');

const authenticate = new AuthenticateSessionController();

async function loadUser(req, res, next) {
  req.user = null;
  if (!req.session || !req.session.accountId) return next();
  try {
    req.user = await authenticate.execute(req.session.accountId);
    return next();
  } catch (err) {
    if (err instanceof AppError) {
      req.authError = err;
      return req.session.destroy(() => next());
    }
    return next(err);
  }
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  return next(req.authError || AppError.unauthorized());
}

/** Allows the request only for the given roles. Blocks users who must change a temporary password. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(req.authError || AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    if (req.user.mustChangePassword) {
      return next(new AppError(403, 'Please change your temporary password before continuing.', { code: 'PASSWORD_CHANGE_REQUIRED' }));
    }
    return next();
  };
}

/** Requires a specific permission code on the user's profile (stories 12-14). */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return next(req.authError || AppError.unauthorized());
    if (!req.user.permissions.includes(permission)) {
      return next(AppError.forbidden('Your user profile does not include permission for this action.'));
    }
    return next();
  };
}

module.exports = { loadUser, requireAuth, requireRole, requirePermission };
