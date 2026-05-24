const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const ctrl = require('../controllers/activityPointsController');

router.use(authenticate);
router.get('/my',          roleCheck('student'), ctrl.getActivityPoints);
router.get('/leaderboard', ctrl.getLeaderboard);

module.exports = router;
