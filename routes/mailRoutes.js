const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  getMails,
  getMailById,
  sendMail,
  deleteMail,
  restoreMail,
} = require('../controllers/mailController');


const router = express.Router();

router.use(authMiddleware);

router.get('/', getMails);
router.get('/:id', getMailById);
router.post('/send', sendMail);
router.patch('/delete/:id', deleteMail);
router.patch('/restore/:id', restoreMail);

module.exports = router;

