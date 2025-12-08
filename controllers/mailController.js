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
    // Find scheduled emails that are due (check emails scheduled up to 5 minutes ago to catch any missed)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60000);
    const scheduledMails = await Mail.find({
      isScheduled: true,
      scheduledAt: { $lte: now, $gte: fiveMinutesAgo },
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
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your-api-key-here') {
      console.error('[AI] GEMINI_API_KEY is not configured in environment variables');
      return res.status(500).json({ 
        message: 'AI service is not configured. Please set GEMINI_API_KEY in your environment variables.' 
      });
    }

    // Log API key status (first 10 chars only for security)
    console.log('[AI] Using Gemini API key:', GEMINI_API_KEY.substring(0, 10) + '...');

    const prompt = `i have to send mail ${message} give only the email body content in short and formal. Do not include subject line, greeting like "Subject:" or any subject-related text. Only provide the message body content.`;

    // Use only gemini-2.0-flash model
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    const apiUrl = `${API_URL}?key=${GEMINI_API_KEY}`;

    console.log('[AI] Sending request to Gemini API...');
    console.log('[AI] Request payload:', JSON.stringify({
      model: 'gemini-2.0-flash',
      promptLength: prompt.length
    }, null, 2));
    console.log(`[AI] API URL: ${apiUrl.replace(GEMINI_API_KEY, 'API_KEY_HIDDEN')}`);
    
    let response;
    let responseData;
    
    try {
      const startTime = Date.now();
      
      response = await axios.post(
        apiUrl,
        {
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      responseData = response.data;
      
      console.log(`[AI] Successfully received response from model: gemini-2.0-flash`);
      console.log('[AI] Response status:', response.status);
      console.log('[AI] Response time:', duration + 'ms');
      console.log('[AI] Response structure:', JSON.stringify({
        hasCandidates: !!responseData.candidates,
        candidatesLength: responseData.candidates?.length || 0,
        hasContent: !!responseData.candidates?.[0]?.content,
        hasParts: !!responseData.candidates?.[0]?.content?.parts,
        hasText: !!responseData.candidates?.[0]?.content?.parts?.[0]?.text
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
      
      console.error('[AI] Gemini API Error:', JSON.stringify(errorDetails, null, 2));
      
      if (axiosError.response) {
        // API responded with error status
        const errorData = axiosError.response.data;
        const status = axiosError.response.status;
        
        // Handle 429 quota exceeded errors with user-friendly message
        if (status === 429) {
          const quotaError = errorData?.error;
          let userMessage = '';
          
          // Check if it's a free tier quota issue
          const isFreeTierQuota = quotaError?.message?.includes('free_tier') || 
                                  quotaError?.message?.includes('limit: 0');
          
          if (isFreeTierQuota) {
            userMessage = '⚠️ Gemini API Free Tier Quota Exhausted\n\n';
            userMessage += 'Your free tier quota has been completely used up (limit: 0).\n\n';
            userMessage += 'Solutions:\n';
            userMessage += '1. Enable billing on Google Cloud Console to get paid tier quota\n';
            userMessage += '2. Wait for daily quota reset (usually resets at midnight PST)\n';
            userMessage += '3. Check your quota status: https://ai.dev/usage?tab=rate-limit\n\n';
            userMessage += 'Note: The free tier has very limited requests per day. ';
            userMessage += 'Once exhausted, you must either enable billing or wait for the next reset cycle.';
            
            // Extract retry time if available (though for free tier, this is usually just a rate limit, not quota reset)
            if (quotaError?.message) {
              const retryMatch = quotaError.message.match(/Please retry in ([\d.]+)s/);
              if (retryMatch) {
                const seconds = Math.ceil(parseFloat(retryMatch[1]));
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = seconds % 60;
                
                if (minutes > 0) {
                  userMessage += `\n\n⏱️ Rate limit cooldown: ${minutes} minute${minutes > 1 ? 's' : ''}${remainingSeconds > 0 ? ` and ${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}` : ''}`;
                } else if (seconds > 0) {
                  userMessage += `\n\n⏱️ Rate limit cooldown: ${seconds} second${seconds > 1 ? 's' : ''}`;
                }
              }
            }
            
            console.error('[AI] Free tier quota exhausted:', {
              errorMessage: quotaError?.message,
              retryTime: quotaError?.message?.match(/Please retry in ([\d.]+)s/)?.[1]
            });
          } else if (quotaError?.message) {
            // Regular rate limit with retry time
            userMessage = 'AI service rate limit exceeded. ';
            const retryMatch = quotaError.message.match(/Please retry in ([\d.]+)s/);
            if (retryMatch) {
              const seconds = Math.ceil(parseFloat(retryMatch[1]));
              const minutes = Math.floor(seconds / 60);
              const remainingSeconds = seconds % 60;
              
              if (minutes > 0) {
                userMessage += `Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}${remainingSeconds > 0 ? ` and ${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}` : ''}.`;
              } else {
                userMessage += `Please try again in ${seconds} second${seconds > 1 ? 's' : ''}.`;
              }
            } else {
              userMessage += 'Please try again later.';
            }
          } else {
            userMessage = 'AI service quota exceeded. Please try again later.';
          }
          
          return res.status(429).json({ 
            message: userMessage 
          });
        }
        
        const errorMessage = errorData?.error?.message || 
                           errorData?.message || 
                           `AI service error: ${status}`;
        return res.status(status >= 400 && status < 500 
          ? status 
          : 500).json({ 
          message: errorMessage 
        });
      } else if (axiosError.request) {
        // Request was made but no response received
        console.error('[AI] No response received from Gemini API');
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

    // Extract generated text from Gemini response
    let generatedText = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!generatedText && responseData.candidates && responseData.candidates.length > 0) {
      // Try alternative response structure
      generatedText = responseData.candidates[0]?.content?.parts?.[0]?.text || 
                     responseData.candidates[0]?.text || 
                     '';
    }

    if (generatedText) {
      console.log(`[AI] Successfully generated text using model: gemini-2.0-flash`);
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

