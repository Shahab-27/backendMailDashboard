// Mailjet HTTP API configuration (works on Render and other cloud platforms).
// Required env vars:
// - MAILJET_API_KEY     (your Mailjet API key)
// - MAILJET_SECRET_KEY  (your Mailjet secret key)
// - MAILJET_FROM        (optional, e.g. "Modern Mail <your-email@gmail.com>")
//                        IMPORTANT: Use an email address you own and can verify!

const apiKey = process.env.MAILJET_API_KEY;
const secretKey = process.env.MAILJET_SECRET_KEY;
const fromDefault = process.env.MAILJET_FROM || 'noreply@example.com';

let isConfigured = false;

if (apiKey && secretKey) {
  isConfigured = true;
  console.log('[MAILER] Mailjet client initialized');
} else {
  console.warn('[MAILER] MAILJET_API_KEY or MAILJET_SECRET_KEY is missing; outgoing email disabled');
}

// Helper function to make authenticated Mailjet API requests
const mailjetRequest = async (endpoint, method = 'GET', body = null) => {
  const authHeader = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
  const url = `https://api.mailjet.com/v3/REST${endpoint}`;
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${authHeader}`,
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const responseText = await response.text();
  let responseData;
  
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText };
  }
  
  return { response, data: responseData };
};

// Helper function to create a sender
const createSender = async (email, name = 'Modern Mail') => {
  try {
    console.log('[MAILER] Creating sender:', email);
    const { response, data } = await mailjetRequest('/sender', 'POST', {
      Email: email,
      Name: name,
      EmailType: 'transactional',
    });
    
    if (response.ok && data.Data && data.Data[0]) {
      const sender = data.Data[0];
      console.log('[MAILER] Sender created:', {
        id: sender.ID,
        email: sender.Email,
        status: sender.Status,
      });
      return sender;
    } else {
      console.error('[MAILER] Failed to create sender:', data);
      return null;
    }
  } catch (err) {
    console.error('[MAILER] Error creating sender:', err.message);
    return null;
  }
};

// Helper function to validate a sender (sends verification email)
const validateSender = async (senderId) => {
  try {
    console.log('[MAILER] Validating sender ID:', senderId);
    const { response, data } = await mailjetRequest(`/sender/${senderId}/validate`, 'POST');
    
    if (response.ok) {
      console.log('[MAILER] Validation email sent for sender ID:', senderId);
      return true;
    } else {
      console.error('[MAILER] Failed to validate sender:', data);
      return false;
    }
  } catch (err) {
    console.error('[MAILER] Error validating sender:', err.message);
    return false;
  }
};

const sendMail = async (options = {}) => {
  if (!isConfigured) {
    const error = new Error('Mailjet is not configured');
    error.statusCode = 500;
    throw error;
  }

  // ALWAYS use verified sender for FROM (ensures delivery)
  // Parse verified FROM address from env (must be verified in Mailjet)
  let verifiedFromEmail = fromDefault;
  let verifiedFromName = 'Modern Mail';
  
  const verifiedFromMatch = fromDefault.match(/^(.+?)\s*<(.+?)>$|^(.+)$/);
  if (verifiedFromMatch) {
    if (verifiedFromMatch[2]) {
      verifiedFromName = verifiedFromMatch[1].trim();
      verifiedFromEmail = verifiedFromMatch[2].trim();
    } else {
      verifiedFromEmail = verifiedFromMatch[3] || verifiedFromMatch[1] || fromDefault;
    }
  }

  // User's desired FROM address (from dashboard) - use as Reply-To
  const userDesiredFrom = options.userFrom || options.from;
  let replyToEmail = null;
  let replyToName = null;
  
  if (userDesiredFrom) {
    const userFromMatch = userDesiredFrom.match(/^(.+?)\s*<(.+?)>$|^(.+)$/);
    if (userFromMatch) {
      if (userFromMatch[2]) {
        replyToName = userFromMatch[1].trim();
        replyToEmail = userFromMatch[2].trim();
      } else {
        replyToEmail = userFromMatch[3] || userFromMatch[1];
      }
    }
  }

  // Build email content - include user's FROM in body if different from verified sender
  // Wrap content in proper HTML with larger font size for better readability
  const baseHtmlStyle = `
    <style>
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 16px;
        line-height: 1.6;
        color: #333333;
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      p { 
        font-size: 16px;
        line-height: 1.6;
        margin: 0 0 12px 0;
      }
      pre {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 16px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-wrap: break-word;
        color: #333333;
        background: transparent;
        border: none;
        padding: 0;
        margin: 0;
      }
      div {
        font-size: 16px;
        line-height: 1.6;
      }
    </style>
  `;

  let htmlContent = options.html || '';
  
  // If no HTML provided, convert plain text to HTML with proper styling
  if (!htmlContent && options.text) {
    // Convert newlines to <br> and wrap in styled div
    htmlContent = `<div style="font-size: 16px; line-height: 1.6; color: #333333;">${options.text.replace(/\n/g, '<br>')}</div>`;
  } else if (htmlContent && !htmlContent.includes('<html')) {
    // If HTML is provided but not wrapped, wrap it properly
    htmlContent = `<div style="font-size: 16px; line-height: 1.6; color: #333333;">${htmlContent}</div>`;
  }
  
  // Wrap in full HTML document with proper styling
  if (!htmlContent.includes('<html')) {
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseHtmlStyle}
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;
  } else {
    // Inject styles into existing HTML
    htmlContent = htmlContent.replace('</head>', `${baseHtmlStyle}</head>`);
    if (!htmlContent.includes('<head>')) {
      htmlContent = htmlContent.replace('<html>', `<html><head>${baseHtmlStyle}</head>`);
    }
  }
  
  let textContent = options.text || options.html || '';
  
  // If user wants a different FROM, use it only as Reply-To header (no extra footer in body)
  // This avoids adding a visible "--- From:" line at the end of the email content.

  // Parse CC and BCC recipients
  const ccRecipients = options.cc ? options.cc.split(',').map(email => ({
    Email: email.trim(),
  })) : [];

  const bccRecipients = options.bcc ? options.bcc.split(',').map(email => ({
    Email: email.trim(),
  })) : [];

  // Mailjet API format - use verified sender for FROM, user's email for Reply-To
  const payload = {
    Messages: [
      {
        From: {
          Email: verifiedFromEmail,  // Always use verified sender (ensures delivery)
          Name: verifiedFromName,
        },
        To: [
          {
            Email: options.to,
          },
        ],
        Subject: options.subject || '(No Subject)',
        HTMLPart: htmlContent,
        TextPart: textContent,
      },
    ],
  };

  // Add CC recipients if any
  if (ccRecipients.length > 0) {
    payload.Messages[0].Cc = ccRecipients;
  }

  // Add BCC recipients if any
  if (bccRecipients.length > 0) {
    payload.Messages[0].Bcc = bccRecipients;
  }

  // Add Reply-To if user provided a different FROM address
  if (replyToEmail) {
    payload.Messages[0].ReplyTo = {
      Email: replyToEmail,
      Name: replyToName || replyToEmail,
    };
  }

  // Add attachments if any
  if (options.attachments && options.attachments.length > 0) {
    const attachmentPromises = options.attachments.map(async (attachment) => {
      try {
        // Download file from Cloudinary URL
        const response = await fetch(attachment.url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Content = buffer.toString('base64');

        // Get content type from response or use default
        const contentType = response.headers.get('content-type') || 'application/octet-stream';

        return {
          ContentType: contentType,
          Filename: attachment.fileName,
          Base64Content: base64Content,
        };
      } catch (error) {
        console.error(`[MAILER] Error processing attachment ${attachment.fileName}:`, error);
        return null;
      }
    });

    const attachments = await Promise.all(attachmentPromises);
    const validAttachments = attachments.filter(att => att !== null);
    
    if (validAttachments.length > 0) {
      payload.Messages[0].Attachments = validAttachments;
    }
  }

  console.log('[MAILER] Sending email via Mailjet', {
    to: options.to,
    subject: payload.Messages[0].Subject,
    verifiedFrom: `${verifiedFromName} <${verifiedFromEmail}>`,
    replyTo: replyToEmail ? `${replyToName || ''} <${replyToEmail}>` : 'none',
    htmlLength: (payload.Messages[0].HTMLPart || '').length,
  });

  try {
    // Mailjet API endpoint (v3.1 gives more detailed feedback)
    const apiUrl = 'https://api.mailjet.com/v3.1/send';
    
    // Create Basic Auth header (API key:Secret key)
    const authHeader = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authHeader}`,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }
    
    if (!response.ok) {
      console.error('[MAILER] Mailjet API error response', {
        status: response.status,
        statusText: response.statusText,
        body: responseData,
      });
      
      // Check if error is about unvalidated sender
      const errorMessage = responseData.ErrorMessage || responseData.ErrorInfo || responseData.message || '';
      if (errorMessage.toLowerCase().includes('not been validated') || 
          errorMessage.toLowerCase().includes('sender') && errorMessage.toLowerCase().includes('validate')) {
        console.error('[MAILER] ⚠️  SENDER VALIDATION REQUIRED');
        console.error('[MAILER] The sender email address needs to be validated in Mailjet.');
        console.error('[MAILER] Sender email:', fromEmail);
        console.error('[MAILER]');
        console.error('[MAILER] To fix this:');
        console.error('[MAILER] 1. Go to https://app.mailjet.com/account/sender');
        console.error('[MAILER] 2. Add and verify your sender email:', fromEmail);
        console.error('[MAILER] 3. Or use an email address you already verified');
        console.error('[MAILER]');
        console.error('[MAILER] You can also create the sender programmatically - check the logs above.');
        
        throw new Error(
          `Sender email "${fromEmail}" is not validated. ` +
          `Please verify this email address in Mailjet dashboard (https://app.mailjet.com/account/sender) ` +
          `or use a different verified email address.`
        );
      }
      
      throw new Error(
        errorMessage ||
        `Mailjet API error: ${response.status} ${response.statusText}`
      );
    }

    console.log('[MAILER] Mailjet response', {
      statusCode: response.status,
      statusText: response.statusText,
      data: responseData,
    });

    // Extract message ID from Mailjet response
    const messageId = responseData.Messages && responseData.Messages[0] && responseData.Messages[0].To && responseData.Messages[0].To[0] 
      ? responseData.Messages[0].To[0].MessageID 
      : responseData.Messages?.[0]?.MessageID || `mailjet-${Date.now()}`;

    // Return a format similar to nodemailer for compatibility
    return {
      messageId: messageId,
      accepted: [options.to],
      rejected: [],
      response: `Mailjet: ${response.status} ${response.statusText}`,
    };
  } catch (err) {
    console.error('[MAILER] Mailjet send error', {
      name: err && err.name,
      message: err && err.message,
      code: err && err.code,
      cause: err && err.cause,
      stack: err && err.stack,
    });
    throw err;
  }
};

module.exports = {
  sendMail,
  isMailerConfigured: isConfigured,
  createSender,
  validateSender,
};
