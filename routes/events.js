const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const { uploadImage } = require('../middleware/upload');
const ctrl = require('../controllers/eventController');

// Public routes (but enhanced if authenticated)
router.get('/',          (req,res,next) => { authenticate(req,res,()=>next()); next(); }, ctrl.getEvents);
router.get('/clash',     ctrl.checkClash);
router.get('/:id',       ctrl.getEvent);

// Protected routes
router.use(authenticate);

// Student
router.post('/:id/like', ctrl.toggleLike);
router.post('/:id/save', ctrl.toggleSave);

// Admin + Authority
router.post('/', roleCheck('admin'), uploadImage.single('poster'), ctrl.createEvent);
router.put('/:id', roleCheck('admin','authority'), uploadImage.single('poster'), ctrl.updateEvent);
router.delete('/:id', roleCheck('admin','authority'), ctrl.deleteEvent);
router.get('/:id/analytics', roleCheck('admin','authority'), ctrl.getEventAnalytics);

module.exports = router;
