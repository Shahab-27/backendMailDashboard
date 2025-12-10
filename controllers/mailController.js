const Mail = require('../models/Mail');
const User = require('../models/User');
const axios = require('axios');
const { sendMail: deliverMail, isMailerConfigured } = require('../config/mailer');

const ALLOWED_FOLDERS = ['inbox', 'sent', 'trash', 'drafts', 'scheduled'];

exports.getMails = async (req, res, next) => {
  try {
    const { folder = 'inbox' } = req.query;

    if (!ALLOWED_FOLDERS.includes(folder)) {
      return res.status(400).json({ message: 'Invalid folder' });
    }

    let query = {
      owner: req.user._id,
    };

    // For scheduled folder, show all scheduled emails (not yet sent)
    if (folder === 'scheduled') {
      query = {
        owner: req.user._id,
        isScheduled: true,
        folder: 'scheduled',
      };
    } else {
      query.folder = folder;
    }

    const mails = await Mail.find(query)
      .sort(folder === 'scheduled' ? { scheduledAt: 1 } : { createdAt: -1 })
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
    const { to, cc = '', bcc = '', subject = '', body = '', htmlBody = '', scheduledAt, attachments = [], draftId } = req.body;

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
      htmlBodyLength: (htmlBody || '').length,
      attachmentsCount: attachments ? attachments.length : 0,
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
        attachments,
        scheduledAt: new Date(scheduledAt),
        isScheduled: true,
        folder: 'scheduled', // Store in scheduled folder
      });

      if (draftId) {
        await Mail.deleteOne({ _id: draftId, owner: req.user._id });
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
        attachments: attachments || [],
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
      attachments,
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
        const inboxMail = await Mail.create({
          owner: recipient._id,
          from: req.user.email,
          to: recipientEmail,
          cc: recipientEmail === to ? cc : undefined,
          bcc: undefined, // BCC recipients shouldn't see each other
          subject,
          body,
          htmlBody,
          attachments,
          folder: 'inbox',
        });
        
        console.log('[MAIL] Email saved to recipient inbox', {
          recipientEmail: recipientEmail,
          mailId: inboxMail._id,
          bodyLength: (inboxMail.body || '').length,
          htmlBodyLength: (inboxMail.htmlBody || '').length,
          attachmentsCount: inboxMail.attachments ? inboxMail.attachments.length : 0,
          subject: inboxMail.subject,
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
// This endpoint doesn't require auth - it's for cron jobs
exports.processScheduledEmails = async (req, res, next) => {
  try {
    // Optional: Add a secret token check for security
    const cronSecret = req.headers['x-cron-secret'] || req.body.secret;
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const now = new Date();
    // Find all scheduled emails that are due (anything at or before "now")
    // Using only an upper bound prevents us from missing emails if the worker
    // was offline longer than 5 minutes.
    const scheduledMails = await Mail.find({
      isScheduled: true,
      scheduledAt: { $lte: now },
      folder: 'scheduled',
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
          attachments: mail.attachments || [],
        });

        // Update mail status to sent
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
                  attachments: mail.attachments || [],
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
    console.log('[AI] generateFormalMessage endpoint called');
    const { message } = req.body;
    console.log('[AI] Received message length:', message?.length || 0);

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Prefer OpenRouter; fallbacks kept for backwards compatibility
    const OPENROUTER_API_KEY =
      process.env.OPENROUTER_API_KEY ||
      process.env.OR_API_KEY ||
      process.env.AI_API_KEY ||
      process.env.GEMINI_API_KEY;
    
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'your-api-key-here') {
      console.error('[AI] OPENROUTER_API_KEY is not configured in environment variables');
      return res.status(500).json({ 
        message: 'AI service is not configured. Please set OPENROUTER_API_KEY in your environment variables.' 
      });
    }

    // Log API key status (first 10 chars only for security)
    console.log('[AI] Using OpenRouter API key:', OPENROUTER_API_KEY.substring(0, 10) + '...');

    const prompt = `i have to send mail ${message} give only the email body content in short and formal. Do not include subject line, greeting like "Subject:" or any subject-related text. Only provide the message body content.`;

    // OpenRouter settings
    const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
    const MODEL = 'google/gemini-2.0-flash';

    console.log('[AI] Sending request to OpenRouter...');
    console.log('[AI] Request payload:', JSON.stringify({
      model: MODEL,
      promptLength: prompt.length
    }, null, 2));

    let response;
    let responseData;
    
    try {
      const startTime = Date.now();
      
      response = await axios.post(
        API_URL,
        {
          model: MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are a concise assistant that writes short, formal email bodies without subjects.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          },
        }
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      responseData = response.data;
      
      console.log(`[AI] Successfully received response from model: ${MODEL}`);
      console.log('[AI] Response status:', response.status);
      console.log('[AI] Response time:', duration + 'ms');
      console.log('[AI] Response structure:', JSON.stringify({
        hasChoices: !!responseData.choices,
        choicesLength: responseData.choices?.length || 0,
        hasMessage: !!responseData.choices?.[0]?.message,
        hasContent: !!responseData.choices?.[0]?.message?.content
      }, null, 2));
      
    } catch (axiosError) {
      // If we don't have a successful response, handle the error
      if (!response || !responseData) {
        if (!axiosError) {
        return res.status(500).json({ 
          message: 'Failed to connect to AI service. No error details available.' 
        });
      }
      const errorDetails = {
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        error: axiosError.response?.data,
        message: axiosError.message
      };
      
      console.error('[AI] OpenRouter API Error:', JSON.stringify(errorDetails, null, 2));
      
      if (axiosError.response) {
        // API responded with error status
        const errorData = axiosError.response.data;
        const status = axiosError.response.status;
        
        const errorMessage =
          errorData?.error?.message ||
          errorData?.message ||
          `AI service error: ${status}`;
        return res.status(status >= 400 && status < 500 ? status : 500).json({
          message: errorMessage,
        });
      } else if (axiosError.request) {
        // Request was made but no response received
        console.error('[AI] No response received from OpenRouter API');
        return res.status(500).json({ 
          message: 'No response from AI service. Please check your internet connection.' 
        });
      } else {
        // Error setting up request
        console.error('[AI] Failed to setup request:', axiosError.message);
        return res.status(500).json({ 
          message: `Failed to connect to AI service: ${axiosError.message}` 
        });
      }
      }
    }

    // Extract generated text from OpenRouter response
    let generatedText = responseData.choices?.[0]?.message?.content || '';

    if (generatedText) {
      console.log(`[AI] Successfully generated text using model: ${MODEL}`);
      console.log('[AI] Generated text length:', generatedText.length);
      console.log('[AI] Generated text preview:', generatedText.substring(0, 100) + '...');
      
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
      
      if (!generatedText) {
        console.error('[AI] Generated text is empty after processing');
        return res.status(500).json({ message: 'AI generated empty response' });
      }
      
      console.log('[AI] Successfully generated formal message');
      console.log('[AI] Final text length:', generatedText.length);
      return res.json({ message: generatedText });
    } else {
      console.error('[AI] Unexpected API response structure:', JSON.stringify(responseData, null, 2));
      return res.status(500).json({ 
        message: 'No response from AI. Please try again.' 
      });
    }
  } catch (error) {
    console.error('[AI] Unexpected error:', error);
    console.error('[AI] Error stack:', error.stack);
    return res.status(500).json({ 
      message: error.message || 'Failed to generate formal message. Please try again.' 
    });
  }
};

