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
    const { to, cc = '', bcc = '', subject = '', body = '', htmlBody = '', scheduledAt, draftId } = req.body;

    if (!to) {
      return res.status(400).json({ message: 'Recipient email is required' });
    }

    if (!isMailerConfigured) {
      return res
        .status(500)
        .json({ message: 'Outgoing email service is not configured on the server' });
    }

    // Check if this is a scheduled email
    const isScheduled = scheduledAt && new Date(scheduledAt) > new Date();

    console.log('[MAIL] sendMail called', {
      user: req.user && req.user.email,
      userId: req.user && req.user._id,
      to,
      cc,
      bcc,
      subject,
      bodyLength: (body || '').length,
      isScheduled,
      scheduledAt,
      draftId,
    });

    // If scheduled, save to database with scheduled flag
    if (isScheduled) {
      const scheduledMail = await Mail.create({
        owner: req.user._id,
        from: req.user.email,
        to,
        cc,
        bcc,
        subject,
        body,
        htmlBody,
        scheduledAt: new Date(scheduledAt),
        isScheduled: true,
        folder: 'drafts', // Keep in drafts until sent
      });

      if (draftId) {
        await Mail.deleteOne({ _id: draftId, owner: req.user._id, folder: 'drafts' });
      }

      return res.status(201).json({
        ...scheduledMail.toObject(),
        message: 'Email scheduled successfully',
      });
    }

    // Send immediately
    try {
      const result = await deliverMail({
        to,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject,
        text: body,
        html: htmlBody || body,
        userFrom: req.user.email,
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
      cc,
      bcc,
      subject,
      body,
      htmlBody,
      folder: 'sent',
    });

    // Parse recipients (to, cc, bcc)
    const recipients = [to];
    if (cc) recipients.push(...cc.split(',').map(e => e.trim()));
    if (bcc) recipients.push(...bcc.split(',').map(e => e.trim()));

    // Create inbox entries for recipients
    for (const recipientEmail of recipients) {
      const recipient = await User.findOne({ email: recipientEmail.toLowerCase() });
      if (recipient) {
        await Mail.create({
          owner: recipient._id,
          from: req.user.email,
          to: recipientEmail,
          cc: recipientEmail === to ? cc : undefined,
          bcc: undefined, // BCC recipients shouldn't see each other
          subject,
          body,
          htmlBody,
          folder: 'inbox',
        });
      }
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
    const { id, to = '', cc = '', bcc = '', subject = '', body = '', htmlBody = '', scheduledAt } = req.body;
    const payload = {
      owner: req.user._id,
      from: req.user.email,
      to,
      cc,
      bcc,
      subject,
      body,
      htmlBody,
      folder: 'drafts',
    };

    // If scheduled date is provided, add it
    if (scheduledAt) {
      payload.scheduledAt = new Date(scheduledAt);
      payload.isScheduled = true;
    }

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
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    next(error);
  }
};

// Process scheduled emails (to be called by cron job)
exports.processScheduledEmails = async (req, res, next) => {
  try {
    const now = new Date();
    const scheduledMails = await Mail.find({
      isScheduled: true,
      scheduledAt: { $lte: now },
      folder: 'drafts',
    }).populate('owner', 'email');

    const results = {
      processed: 0,
      failed: 0,
      errors: [],
    };

    for (const mail of scheduledMails) {
      try {
        // Send the email
        await deliverMail({
          to: mail.to,
          cc: mail.cc || undefined,
          bcc: mail.bcc || undefined,
          subject: mail.subject,
          text: mail.body,
          html: mail.htmlBody || mail.body,
          userFrom: mail.from,
        });

        // Update mail status
        mail.folder = 'sent';
        mail.isScheduled = false;
        mail.scheduledAt = null;
        await mail.save();

        // Create inbox entry for recipient
        const recipient = await User.findOne({ email: mail.to.toLowerCase() });
        if (recipient) {
          const recipients = [mail.to];
          if (mail.cc) recipients.push(...mail.cc.split(',').map(e => e.trim()));
          if (mail.bcc) recipients.push(...mail.bcc.split(',').map(e => e.trim()));

          for (const recipientEmail of recipients) {
            const rec = await User.findOne({ email: recipientEmail.toLowerCase() });
            if (rec) {
              await Mail.create({
                owner: rec._id,
                from: mail.from,
                to: recipientEmail,
                cc: recipientEmail === mail.to ? mail.cc : undefined,
                bcc: undefined,
                subject: mail.subject,
                body: mail.body,
                htmlBody: mail.htmlBody,
                folder: 'inbox',
              });
            }
          }
        }

        results.processed++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          mailId: mail._id,
          error: error.message,
        });
        console.error(`[MAIL] Failed to send scheduled email ${mail._id}:`, error);
      }
    }

    res.json({
      message: 'Scheduled emails processed',
      ...results,
    });
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
    const prompt = `i have to send mail ${message} give only the email body content in short and formal. Do not include subject line, greeting like "Subject:" or any subject-related text. Only provide the message body content.`;

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

    let generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (generatedText) {
      // Split into lines for processing
      let lines = generatedText.split('\n');
      
      // Remove lines that contain "Subject:" anywhere (case-insensitive)
      lines = lines.filter(line => {
        const lowerLine = line.trim().toLowerCase();
        // Remove lines that start with "subject:" or contain "subject:" followed by content
        if (lowerLine.startsWith('subject:') || lowerLine.match(/^subject\s*:/i)) {
          return false;
        }
        // Remove lines that are just "Subject:" or variations
        if (lowerLine === 'subject:' || lowerLine === 'subject') {
          return false;
        }
        return true;
      });
      
      // Join back and remove any remaining subject patterns using regex
      generatedText = lines.join('\n');
      
      // Remove subject patterns more aggressively (handles various formats)
      generatedText = generatedText
        .replace(/^Subject\s*:.*$/gmi, '') // Lines starting with "Subject:"
        .replace(/^SUBJECT\s*:.*$/gmi, '') // Lines starting with "SUBJECT:"
        .replace(/^subject\s*:.*$/gmi, '') // Lines starting with "subject:"
        .replace(/Subject\s*:.*$/gmi, '') // Any line containing "Subject:"
        .replace(/SUBJECT\s*:.*$/gmi, '') // Any line containing "SUBJECT:"
        .replace(/subject\s*:.*$/gmi, '') // Any line containing "subject:"
        .split('\n')
        .map(line => line.trim())
        .filter(line => {
          // Remove empty lines and lines that are just "Subject:" variations
          if (!line) return false;
          const lower = line.toLowerCase();
          if (lower.startsWith('subject') && lower.includes(':')) return false;
          return true;
        })
        .join('\n')
        .trim();
      
      return res.json({ message: generatedText });
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

