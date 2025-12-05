const Mail = require('../models/Mail');
const User = require('../models/User');
const { sendMail: deliverMail, isMailerConfigured } = require('../config/mailer');

const ALLOWED_FOLDERS = ['inbox', 'sent', 'trash', 'drafts'];

exports.getMails = async (req, res, next) => {
  try {
    const { folder = 'inbox' } = req.query;

    if (!ALLOWED_FOLDERS.includes(folder)) {
      return res.status(400).json({ message: 'Invalid folder' });
    }

    const mails = await Mail.find({
      owner: req.user._id,
      folder,
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json(mails);
  } catch (error) {
    next(error);
  }
};

exports.getMailById = async (req, res, next) => {
  try {
    const mail = await Mail.findOne({
      _id: req.params.id,
      owner: req.user._id,
    }).lean();

    if (!mail) {
      return res.status(404).json({ message: 'Mail not found' });
    }

    res.json(mail);
  } catch (error) {
    next(error);
  }
};

exports.sendMail = async (req, res, next) => {
  try {
    const { to, subject = '', body = '', draftId } = req.body;

    if (!to) {
      return res.status(400).json({ message: 'Recipient email is required' });
    }

    if (!isMailerConfigured) {
      return res
        .status(500)
        .json({ message: 'Outgoing email service is not configured on the server' });
    }

    console.log('[MAIL] sendMail called', {
      user: req.user && req.user.email,
      to,
      subject,
    });

    try {
      const result = await deliverMail({
        to,
        subject,
        text: body,
        html: body,
      });
      console.log('[MAIL] deliverMail result:', {
        messageId: result && result.messageId,
        accepted: result && result.accepted,
        rejected: result && result.rejected,
        response: result && result.response,
      });
    } catch (sendError) {
      console.error('[MAIL] Error while sending email via SMTP:', sendError);
      return res.status(502).json({
        message: 'Failed to send email via SMTP',
        details: sendError.message,
      });
    }

    const senderMail = await Mail.create({
      owner: req.user._id,
      from: req.user.email,
      to,
      subject,
      body,
      folder: 'sent',
    });

    const recipient = await User.findOne({ email: to.toLowerCase() });

    if (recipient) {
      await Mail.create({
        owner: recipient._id,
        from: req.user.email,
        to,
        subject,
        body,
        folder: 'inbox',
      });
    }

    if (draftId) {
      await Mail.deleteOne({ _id: draftId, owner: req.user._id, folder: 'drafts' });
    }

    res.status(201).json(senderMail);
  } catch (error) {
    next(error);
  }
};

exports.saveDraft = async (req, res, next) => {
  try {
    const { id, to = '', subject = '', body = '' } = req.body;
    const payload = {
      owner: req.user._id,
      from: req.user.email,
      to,
      subject,
      body,
      folder: 'drafts',
    };

    let draft;
    if (id) {
      draft = await Mail.findOneAndUpdate({ _id: id, owner: req.user._id }, payload, {
        new: true,
      });
      if (!draft) {
        return res.status(404).json({ message: 'Draft not found' });
      }
    } else {
      draft = await Mail.create(payload);
    }

    res.status(id ? 200 : 201).json(draft);
  } catch (error) {
    next(error);
  }
};

exports.deleteMail = async (req, res, next) => {
  try {
    const mail = await Mail.findOneAndUpdate(
      {
        _id: req.params.id,
        owner: req.user._id,
      },
      { folder: 'trash' },
      { new: true }
    );

    if (!mail) {
      return res.status(404).json({ message: 'Mail not found' });
    }

    res.json(mail);
  } catch (error) {
    next(error);
  }
};

exports.restoreMail = async (req, res, next) => {
  try {
    const { folder = 'inbox' } = req.body;
    const targetFolder = ALLOWED_FOLDERS.includes(folder) ? folder : 'inbox';

    const mail = await Mail.findOneAndUpdate(
      {
        _id: req.params.id,
        owner: req.user._id,
        folder: 'trash',
      },
      { folder: targetFolder },
      { new: true }
    );

    if (!mail) {
      return res.status(404).json({ message: 'Mail not found in trash' });
    }

    res.json(mail);
  } catch (error) {
    next(error);
  }
};

exports.emptyTrash = async (req, res, next) => {
  try {
    const result = await Mail.deleteMany({
      owner: req.user._id,
      folder: 'trash',
    });

    res.json({
      message: 'Trash emptied successfully',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};

