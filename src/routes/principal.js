const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/principalController')
const { authenticate } = require('../middleware/auth')
const { requireRole } = require('../middleware/roleCheck')

// All routes require authority login
router.use(authenticate, requireRole('authority'))

router.post('/verify',              ctrl.verifyAccess)
router.get('/availability',         ctrl.getAvailability)
router.patch('/availability',       ctrl.updateAvailability)
router.get('/schedule',             ctrl.getSchedule)
router.post('/schedule',            ctrl.addSchedule)
router.patch('/schedule/:id',       ctrl.updateSchedule)
router.delete('/schedule/:id',      ctrl.deleteSchedule)

module.exports = router
