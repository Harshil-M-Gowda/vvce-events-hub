const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const ctrl = require('../controllers/attendanceController');

router.use(authenticate);

router.get('/by-date',                    roleCheck('authority'), ctrl.getEventsByDate);
router.get('/event/:eventId',             roleCheck('admin','authority'), ctrl.getEventAttendance);
router.post('/',                          roleCheck('admin'), ctrl.markAttendance);
router.post('/bulk',                      roleCheck('admin'), ctrl.bulkMarkAttendance);

module.exports = router;
