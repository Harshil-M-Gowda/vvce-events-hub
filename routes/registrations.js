const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const ctrl = require('../controllers/registrationController');

router.use(authenticate);

router.post('/',                             roleCheck('student'), ctrl.registerForEvent);
router.get('/my',                            roleCheck('student'), ctrl.getMyRegistrations);
router.delete('/:id',                        roleCheck('student'), ctrl.cancelRegistration);
router.post('/team/:team_id/approve',        roleCheck('student'), ctrl.approveTeamInvite);
router.get('/event/:eventId',                roleCheck('admin','authority'), ctrl.getEventRegistrations);

module.exports = router;
