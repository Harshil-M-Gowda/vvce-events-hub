const express = require('express');
const { body, query: qv, param } = require('express-validator');
const { authenticate, requireVerified, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { posterUpload, certificateUpload } = require('../middleware/upload');

const authController       = require('../controllers/authController');
const eventController      = require('../controllers/eventController');
const registrationController = require('../controllers/registrationController');
const paymentController    = require('../controllers/paymentController');
const certificateController = require('../controllers/certificateController');
const attendanceController  = require('../controllers/attendanceController');
const notificationController = require('../controllers/notificationController');
const userController        = require('../controllers/userController');

const router = express.Router();

// ─── AUTH ─────────────────────────────────────────────────────────────────────
const authRouter = express.Router();

authRouter.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email required').custom(v => {
    if (!v.endsWith('@vvce.ac.in')) throw new Error('Only VVCE institutional email IDs are allowed');
    return true;
  }),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').optional().isIn(['student', 'admin', 'authority']).withMessage('Invalid role'),
], validate, authController.register);

authRouter.post('/verify-email', [
  body('token').notEmpty().withMessage('Verification token required'),
], validate, authController.verifyEmailToken);

// GET version: handles direct browser navigation from email link
// Frontend reads ?token from URL and POSTs it — but this GET is a safety fallback
authRouter.get('/verify-email', async (req, res, next) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ success: false, message: 'No verification token provided.' });
  }
  req.body = { token };
  return authController.verifyEmailToken(req, res, next);
});

authRouter.post('/login', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
], validate, authController.login);

authRouter.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email required'),
], validate, authController.forgotPassword);

authRouter.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], validate, authController.resetPassword);

authRouter.get('/me', authenticate, authController.getMe);

// ─── EVENTS ───────────────────────────────────────────────────────────────────
const eventRouter = express.Router();

eventRouter.get('/', eventController.getEvents);
eventRouter.get('/clash-check', authenticate, requireVerified, authorize('admin', 'authority'), eventController.clashCheck);
eventRouter.get('/:id', eventController.getEventById);
eventRouter.get('/:id/analytics', authenticate, requireVerified, authorize('admin', 'authority'), eventController.getEventAnalytics);

eventRouter.post('/', authenticate, requireVerified, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Event name required'),
  body('club_name').trim().notEmpty().withMessage('Club name required'),
  body('event_date').isDate().withMessage('Valid event date required'),
  body('event_time').notEmpty().withMessage('Event time required'),
  body('venue').trim().notEmpty().withMessage('Venue required'),
  body('max_participants').isInt({ min: 1 }).withMessage('Max participants must be a positive integer'),
], validate, posterUpload.single('poster'), eventController.createEvent);

eventRouter.patch('/:id', authenticate, requireVerified, authorize('admin', 'authority'),
  posterUpload.single('poster'), eventController.updateEvent);

eventRouter.patch('/:id/approve', authenticate, requireVerified, authorize('authority'), [
  body('status').isIn(['approved', 'rejected', 'changes_requested']).withMessage('Invalid status'),
], validate, eventController.approveEvent);

eventRouter.delete('/:id', authenticate, requireVerified, authorize('admin', 'authority'), eventController.deleteEvent);

// ─── REGISTRATIONS ────────────────────────────────────────────────────────────
const registrationRouter = express.Router();

registrationRouter.post('/', authenticate, requireVerified, authorize('student'), [
  body('event_id').isInt().withMessage('Valid event ID required'),
], validate, registrationController.registerForEvent);

registrationRouter.post('/team-approve', [
  body('token').notEmpty().withMessage('Token required'),
  body('action').isIn(['accept', 'decline']).withMessage('Action must be accept or decline'),
], validate, registrationController.approveTeamInvite);

registrationRouter.get('/my', authenticate, requireVerified, authorize('student'), registrationController.getMyRegistrations);

registrationRouter.get('/event/:eventId', authenticate, requireVerified,
  authorize('admin', 'authority'), registrationController.getEventRegistrations);

registrationRouter.delete('/:id', authenticate, requireVerified, authorize('student'), registrationController.cancelRegistration);

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
const paymentRouter = express.Router();

paymentRouter.post('/initiate', authenticate, requireVerified, authorize('student'), [
  body('event_id').isInt().withMessage('Valid event ID required'),
  body('method').isIn(['upi', 'card', 'netbanking']).withMessage('Invalid payment method'),
], validate, paymentController.initiatePayment);

paymentRouter.post('/verify', authenticate, requireVerified, authorize('student'), [
  body('payment_id').isInt().withMessage('Valid payment ID required'),
], validate, paymentController.verifyPayment);

paymentRouter.get('/my', authenticate, requireVerified, authorize('student'), paymentController.getMyPayments);

paymentRouter.get('/event/:eventId/revenue', authenticate, requireVerified,
  authorize('admin', 'authority'), paymentController.getEventRevenue);

// ─── CERTIFICATES ─────────────────────────────────────────────────────────────
const certRouter = express.Router();

certRouter.post('/', authenticate, requireVerified, authorize('admin'),
  certificateUpload.single('certificate'), [
    body('event_id').isInt().withMessage('Valid event ID required'),
    body('student_id').isInt().withMessage('Valid student ID required'),
  ], validate, certificateController.uploadCertificate);

certRouter.post('/bulk', authenticate, requireVerified, authorize('admin'),
  certificateUpload.single('certificate'), [
    body('event_id').isInt().withMessage('Valid event ID required'),
  ], validate, certificateController.bulkUploadCertificates);

certRouter.get('/my', authenticate, requireVerified, authorize('student'), certificateController.getMyCertificates);
certRouter.get('/activity-points', authenticate, requireVerified, certificateController.getActivityPoints);
certRouter.get('/activity-points/:studentId', authenticate, requireVerified,
  authorize('admin', 'authority'), certificateController.getActivityPoints);
certRouter.get('/student/:studentId', authenticate, requireVerified,
  authorize('admin', 'authority'), certificateController.getStudentCertificates);
certRouter.get('/event/:eventId', authenticate, requireVerified,
  authorize('admin', 'authority'), certificateController.getEventCertificates);

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
const attendanceRouter = express.Router();

attendanceRouter.post('/mark', authenticate, requireVerified, authorize('admin'), [
  body('event_id').isInt().withMessage('Valid event ID required'),
  body('attendance_list').isArray({ min: 1 }).withMessage('Attendance list required'),
], validate, attendanceController.markAttendance);

attendanceRouter.patch('/:id', authenticate, requireVerified, authorize('admin'),
  attendanceController.toggleAttendance);

attendanceRouter.get('/my', authenticate, requireVerified, authorize('student'),
  attendanceController.getMyAttendance);

attendanceRouter.get('/event/:eventId', authenticate, requireVerified,
  authorize('admin', 'authority'), attendanceController.getEventAttendance);

attendanceRouter.get('/date/:date', authenticate, requireVerified,
  authorize('authority'), attendanceController.getAttendanceByDate);

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
const notifRouter = express.Router();

notifRouter.get('/', authenticate, requireVerified, notificationController.getNotifications);
notifRouter.patch('/read-all', authenticate, requireVerified, notificationController.markAllAsRead);
notifRouter.patch('/:id/read', authenticate, requireVerified, notificationController.markAsRead);
notifRouter.delete('/:id', authenticate, requireVerified, notificationController.deleteNotification);
notifRouter.post('/send', authenticate, requireVerified, authorize('admin', 'authority'), [
  body('title').trim().notEmpty().withMessage('Title required'),
  body('message').trim().notEmpty().withMessage('Message required'),
], validate, notificationController.sendNotification);

// ─── USERS ────────────────────────────────────────────────────────────────────
const userRouter = express.Router();

userRouter.get('/profile', authenticate, userController.getProfile);
userRouter.patch('/profile', authenticate, requireVerified, userController.updateProfile);
userRouter.patch('/change-password', authenticate, requireVerified, [
  body('current_password').notEmpty().withMessage('Current password required'),
  body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
], validate, userController.changePassword);

userRouter.get('/dashboard/student', authenticate, requireVerified,
  authorize('student'), userController.getStudentDashboard);
userRouter.get('/dashboard/admin', authenticate, requireVerified,
  authorize('admin'), userController.getAdminDashboard);
userRouter.get('/dashboard/authority', authenticate, requireVerified,
  authorize('authority'), userController.getAuthorityDashboard);

userRouter.get('/clubs', authenticate, requireVerified,
  authorize('authority', 'admin'), userController.getClubsSummary);
userRouter.get('/all', authenticate, requireVerified,
  authorize('authority'), userController.getAllUsers);

// ─── V2/V3 FEATURE ROUTES ────────────────────────────────────────────────────
const clubsRouter     = require('./clubs');
const deanRouter      = require('./dean');
const studentsRouter  = require('./students');
const principalRouter = require('./principal');

// Extended certificate routes (V2)
router.post('/certificates/upload-external',
  authenticate, requireVerified, authorize('student'),
  certificateUpload.single('certificate'),
  certificateController.uploadExternalCertificate
);
router.patch('/certificates/:id/verify',
  authenticate, requireVerified, authorize('admin', 'authority'),
  certificateController.verifyCertificate
);
router.delete('/certificates/:id',
  authenticate, requireVerified,
  certificateController.deleteCertificate
);

// ─── MOUNT ALL ────────────────────────────────────────────────────────────────
router.use('/auth',           authRouter);
router.use('/events',         eventRouter);
router.use('/registrations',  registrationRouter);
router.use('/payments',       paymentRouter);
router.use('/certificates',   certRouter);
router.use('/attendance',     attendanceRouter);
router.use('/notifications',  notifRouter);
router.use('/users',          userRouter);
router.use('/clubs',          clubsRouter);
router.use('/dean',           deanRouter);
router.use('/students',       studentsRouter);
router.use('/principal',      principalRouter);

module.exports = router;
