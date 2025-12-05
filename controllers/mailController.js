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
      userId: req.user && req.user._id,
      to,
      subject,
      bodyLength: (body || '').length,
      draftId,
    });

    try {
      const result = await deliverMail({
        to,
        subject,
        text: body,
        html: body,
        userFrom: req.user.email, // User's email from dashboard (will be used as Reply-To)
      });
      console.log('[MAIL] deliverMail result (raw):', result);
    } catch (sendError) {
      console.error('[MAIL] Error while sending email via provider:', {
        name: sendError && sendError.name,
        message: sendError && sendError.message,
        stack: sendError && sendError.stack,
        responseBody: sendError && sendError.response && sendError.response.body,
      });
      return res.status(502).json({
        message: 'Failed to send email via provider',
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

exports.generateFormalMessage = async (req, res, next) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDbosh5jfhGyAonmk3Li48528EwbNkhC7I';
    const prompt = `i have to send mail ${message} give only the content in short and formal`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error?.message || data.message || 'Failed to generate message';
      console.error('Gemini API Error:', data);
      return res.status(response.status).json({ message: errorMessage });
    }

    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (generatedText) {
      return res.json({ message: generatedText.trim() });
    } else {
      console.error('Unexpected API response:', data);
      return res.status(500).json({ message: 'No response from AI' });
    }
  } catch (error) {
    console.error('AI Generation Error:', error);
    return res.status(500).json({ 
      message: error.message || 'Failed to generate formal message' 
    });
  }
};

