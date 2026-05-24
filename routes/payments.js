const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const ctrl = require('../controllers/paymentController');

router.use(authenticate);
router.post('/initiate',    roleCheck('student'), ctrl.initiatePayment);
router.post('/complete',    roleCheck('student'), ctrl.completePayment);
router.get('/history',      roleCheck('student'), ctrl.getPaymentHistory);

module.exports = router;
