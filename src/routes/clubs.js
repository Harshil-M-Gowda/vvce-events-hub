const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/clubController')
const { authenticate } = require('../middleware/auth')
const { requireRole } = require('../middleware/roleCheck')

// Public — club admin registration
router.post('/register', ctrl.registerClub)

// Authority/Dean — view all clubs
router.get('/all', authenticate, requireRole('authority'), ctrl.getAllClubs)
router.get('/pending', authenticate, requireRole('authority'), ctrl.getPending)
router.patch('/:id/approve', authenticate, requireRole('authority'), ctrl.approveClub)
router.patch('/:id/reject', authenticate, requireRole('authority'), ctrl.rejectClub)

module.exports = router
