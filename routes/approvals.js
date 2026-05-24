const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { isAuthority } = require('../middleware/roleCheck');
const ctrl = require('../controllers/approvalController');

router.use(authenticate, isAuthority);

router.get('/',             ctrl.getPendingApprovals);
router.get('/stats',        ctrl.getApprovalStats);
router.put('/:id/approve',  ctrl.approveEvent);
router.put('/:id/reject',   ctrl.rejectEvent);
router.put('/:id/changes',  ctrl.requestChanges);

module.exports = router;
