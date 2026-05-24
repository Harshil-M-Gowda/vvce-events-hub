const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || 'uploads');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (allowed) => (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error(`Only ${allowed.join(', ')} files are allowed`), false);
};

const posterUpload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880 },
  fileFilter: fileFilter(['.jpg', '.jpeg', '.png', '.webp']),
});

const certificateUpload = multer({
  storage,
  limits: { fileSize: 10485760 },
  fileFilter: fileFilter(['.pdf', '.jpg', '.jpeg', '.png']),
});

module.exports = { posterUpload, certificateUpload };
