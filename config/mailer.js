// Mailjet HTTP API configuration (works on Render and other cloud platforms).
// Required env vars:
// - MAILJET_API_KEY     (your Mailjet API key)
// - MAILJET_SECRET_KEY  (your Mailjet secret key)
// - MAILJET_FROM        (optional, e.g. "Modern Mail <noreply@example.com>")

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

const sendMail = async (options = {}) => {
  if (!isConfigured) {
    const error = new Error('Mailjet is not configured');
    error.statusCode = 500;
    throw error;
  }

  // Parse FROM address (can be "Name <email@example.com>" or just "email@example.com")
  let fromEmail = fromDefault;
  let fromName = 'Modern Mail';
  
  const fromAddress = options.from || fromDefault;
  const fromMatch = fromAddress.match(/^(.+?)\s*<(.+?)>$|^(.+)$/);
  if (fromMatch) {
    if (fromMatch[2]) {
      fromName = fromMatch[1].trim();
      fromEmail = fromMatch[2].trim();
    } else {
      fromEmail = fromMatch[3] || fromMatch[1] || fromDefault;
    }
  }

  // Mailjet API format
  const payload = {
    Messages: [
      {
        From: {
          Email: fromEmail,
          Name: fromName,
        },
        To: [
          {
            Email: options.to,
          },
        ],
        Subject: options.subject || '(No Subject)',
        HTMLPart: options.html || `<pre>${options.text || ''}</pre>`,
        TextPart: options.text || options.html || '',
      },
    ],
  };

  console.log('[MAILER] Sending email via Mailjet', {
    to: options.to,
    subject: payload.Messages[0].Subject,
    from: `${fromName} <${fromEmail}>`,
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
      throw new Error(
        responseData.ErrorMessage || 
        responseData.ErrorInfo || 
        responseData.message ||
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
};
