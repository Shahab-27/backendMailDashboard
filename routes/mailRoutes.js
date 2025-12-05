const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  getMails,
  getMailById,
  sendMail,
  deleteMail,
  restoreMail,
  saveDraft,
  generateFormalMessage,
} = require('../controllers/mailController');


const router = express.Router();

router.use(authMiddleware);

router.get('/', getMails);
router.get('/:id', getMailById);
router.post('/send', sendMail);
router.post('/draft', saveDraft);
router.post('/generate-formal', generateFormalMessage);
router.patch('/delete/:id', deleteMail);
router.patch('/restore/:id', restoreMail);

module.exports = router;

