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
