const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const { uploadDoc } = require('../middleware/upload');
const ctrl = require('../controllers/certificateController');

router.use(authenticate);

router.get('/my',            roleCheck('student'), ctrl.getMyCertificates);
router.post('/upload',       roleCheck('admin'), uploadDoc.single('certificate'), ctrl.uploadCertificate);
router.post('/bulk-upload',  roleCheck('admin'), ctrl.bulkUploadCertificates);

module.exports = router;
