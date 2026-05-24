const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/notificationController');

router.use(authenticate);
router.get('/',            ctrl.getNotifications);
router.put('/:id/read',    ctrl.markAsRead);
router.put('/read-all',    ctrl.markAllAsRead);

module.exports = router;
