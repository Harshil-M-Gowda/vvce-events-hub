const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/studentProfileController')
const { authenticate } = require('../middleware/auth')
const { requireRole } = require('../middleware/roleCheck')
const multer = require('multer')
const path = require('path')

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, `${req.user.id}-${Date.now()}${path.extname(file.originalname)}`)
  }
})
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } })

router.use(authenticate)

router.get('/profile', ctrl.getProfile)
router.patch('/profile', ctrl.updateProfile)
router.post('/upload-photo', upload.single('photo'), ctrl.uploadPhoto)
router.post('/upload-resume', upload.single('resume'), ctrl.uploadResume)

module.exports = router
