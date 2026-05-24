const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/deanController')
const { authenticate } = require('../middleware/auth')
const { requireRole } = require('../middleware/roleCheck')

// All dean routes require authority role
router.use(authenticate, requireRole('authority'))

// Verify secondary password
router.post('/verify', ctrl.verifyAccess)

// Dean portal data
router.get('/stats', ctrl.getStats)
router.get('/events', ctrl.getEvents)
router.get('/clash-check', ctrl.detectClashes)
router.get('/logs', ctrl.getLogs)

module.exports = router
