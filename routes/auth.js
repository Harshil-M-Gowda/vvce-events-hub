const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/authController');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

const passwordRules = body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters');
const emailRules    = body('email').isEmail().normalizeEmail().withMessage('Invalid email');

// POST /api/auth/register/student
router.post('/register/student', [
  body('full_name').notEmpty().trim().withMessage('Full name required'),
  body('usn').notEmpty().trim().withMessage('USN required'),
  emailRules, passwordRules,
  body('semester').isInt({ min:1, max:8 }).withMessage('Invalid semester'),
  body('branch').notEmpty().trim(),
], validate, ctrl.registerStudent);

// POST /api/auth/register/admin
router.post('/register/admin', [
  body('full_name').notEmpty().trim(),
  body('club_name').notEmpty().trim(),
  emailRules, passwordRules,
], validate, ctrl.registerAdmin);

// POST /api/auth/register/authority
router.post('/register/authority', [
  body('full_name').notEmpty().trim(),
  body('designation').notEmpty().trim(),
  emailRules, passwordRules,
], validate, ctrl.registerAuthority);

// POST /api/auth/login
router.post('/login', [emailRules, body('password').notEmpty()], validate, ctrl.login);

// GET /api/auth/verify-email
router.get('/verify-email', ctrl.verifyEmail);

// POST /api/auth/forgot-password
router.post('/forgot-password', [emailRules], validate, ctrl.forgotPassword);

// POST /api/auth/reset-password
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min:8 }),
], validate, ctrl.resetPassword);

// GET /api/auth/me
router.get('/me', authenticate, ctrl.getProfile);

module.exports = router;
