const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const ctrl = require('../controllers/clubController');

router.get('/',       ctrl.getClubs);
router.get('/stats',  authenticate, roleCheck('authority'), ctrl.getClubStats);
router.post('/',      authenticate, roleCheck('admin'), ctrl.createClub);

module.exports = router;
