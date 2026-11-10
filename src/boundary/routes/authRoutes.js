'use strict';

/**
 * Boundary: authentication and self-service account endpoints (all actors).
 *   POST /api/auth/login .............. LoginController (5, 18, 36, 54)
 *   POST /api/auth/logout ............. LogoutController (6, 28, 42, 55)
 *   GET  /api/auth/me ................. current session user
 *   POST /api/auth/register/customer .. RegisterCustomerController (35)
 *   POST /api/auth/register/designer .. RegisterInteriorDesignerController (17)
 *   PUT  /api/auth/me ................. EditPersonalProfileController (18, 36)
 *   PUT  /api/auth/me/password ........ ChangePasswordController
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../../config/env');
const { asyncHandler } = require('../../middleware/errorHandler');
const { requireAuth } = require('../../middleware/auth');
const {
  LoginController, LogoutController, RegisterCustomerController, RegisterInteriorDesignerController,
  EditPersonalProfileController, ChangePasswordController,
} = require('../../control/auth/AuthControllers');

const router = express.Router();
const login = new LoginController();
const logout = new LogoutController();
const registerCustomer = new RegisterCustomerController();
const registerDesigner = new RegisterInteriorDesignerController();
const editProfile = new EditPersonalProfileController();
const changePassword = new ChangePasswordController();

// Brute-force protection on credential endpoints (disabled under test)
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

function startSession(req, user) {
  return new Promise((resolve, reject) => {
    // New session id on login prevents session fixation
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.accountId = user.accountId;
      return req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

router.post('/login', sensitiveLimiter, asyncHandler(async (req, res) => {
  const user = await login.execute({ email: req.body.email, password: req.body.password });
  await startSession(req, user);
  res.json({ user, message: `Welcome back, ${user.fullName}.` });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const result = await logout.execute({
    endSession: () => new Promise((resolve) => (req.session ? req.session.destroy(() => resolve()) : resolve())),
  });
  res.clearCookie('dm.sid');
  res.json(result);
}));

router.get('/me', (req, res) => {
  if (!req.user) {
    const status = req.authError ? req.authError.status : 200;
    return res.status(status).json({ user: null, ...(req.authError ? { error: req.authError.message } : {}) });
  }
  return res.json({ user: req.user });
});

router.post('/register/customer', sensitiveLimiter, asyncHandler(async (req, res) => {
  const user = await registerCustomer.execute(req.body);
  await startSession(req, user);
  res.status(201).json({ user, message: 'Your free account has been created. Welcome to DesignMatch!' });
}));

router.post('/register/designer', sensitiveLimiter, asyncHandler(async (req, res) => {
  const result = await registerDesigner.execute(req.body);
  res.status(201).json(result);
}));

router.put('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await editProfile.execute(req.user, req.body);
  res.json({ user, message: 'Your profile has been updated.' });
}));

router.put('/me/password', requireAuth, sensitiveLimiter, asyncHandler(async (req, res) => {
  res.json(await changePassword.execute(req.user, req.body));
}));

module.exports = router;
