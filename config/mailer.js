// Mailget HTTP API configuration (works on Render and other cloud platforms).
// Required env vars:
// - MAILGET_API_KEY  (your Mailget API key)
// - MAILGET_FROM     (optional, e.g. "Modern Mail <noreply@example.com>")

const apiKey = process.env.MAILGET_API_KEY;
const fromDefault = process.env.MAILGET_FROM || 'noreply@mailget.com';

let isConfigured = false;

if (apiKey) {
  isConfigured = true;
  console.log('[MAILER] Mailget client initialized');
} else {
  console.warn('[MAILER] MAILGET_API_KEY is missing; outgoing email disabled');
}

const sendMail = async (options = {}) => {
  if (!isConfigured) {
    const error = new Error('Mailget is not configured');
    error.statusCode = 500;
    throw error;
  }

  const fromAddress = options.from || fromDefault;
  const payload = {
    to: options.to,
    subject: options.subject || '(No Subject)',
    html: options.html || `<pre>${options.text || ''}</pre>`,
    text: options.text || options.html,
    from: fromAddress,
  };

  console.log('[MAILER] Sending email via Mailget', {
    to: payload.to,
    subject: payload.subject,
    from: payload.from,
    htmlLength: (payload.html || '').length,
  });

  try {
    // Mailget API endpoint - using HTTP Basic Auth
    const apiUrl = 'https://api.mailget.com/send';
    
    // Create Basic Auth header (API key as username, empty or same as password)
    const authHeader = Buffer.from(`${apiKey}:`).toString('base64');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authHeader}`,
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();
    
    if (!response.ok) {
      throw new Error(
        responseData.message || 
        responseData.error || 
        `Mailget API error: ${response.status} ${response.statusText}`
      );
    }

    console.log('[MAILER] Mailget response', {
      statusCode: response.status,
      statusText: response.statusText,
      data: responseData,
    });

    // Return a format similar to nodemailer for compatibility
    return {
      messageId: responseData.messageId || responseData.id || `mailget-${Date.now()}`,
      accepted: [payload.to],
      rejected: [],
      response: `Mailget: ${response.status} ${response.statusText}`,
    };
  } catch (err) {
    console.error('[MAILER] Mailget send error', {
      name: err && err.name,
      message: err && err.message,
      stack: err && err.stack,
    });
    throw err;
  }
};

module.exports = {
  sendMail,
  isMailerConfigured: isConfigured,
};
