const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { uploadFile, uploadMultipleFiles } = require('../controllers/uploadController');

const router = express.Router();

router.use(authMiddleware);

router.post('/single', uploadFile);
router.post('/multiple', uploadMultipleFiles);

module.exports = router;

