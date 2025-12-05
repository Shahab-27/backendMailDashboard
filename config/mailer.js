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
    // Try different possible Mailget API endpoints
    const possibleEndpoints = [
      'https://api.mailget.com/v1/send',
      'https://api.mailget.com/send',
      'https://mailget.com/api/send',
      'https://api.formget.com/send', // Mailget might be part of FormGet
    ];

    let lastError = null;
    
    for (const apiUrl of possibleEndpoints) {
      try {
        console.log('[MAILER] Trying endpoint:', apiUrl);
        
        // Create Basic Auth header (API key as username)
        const authHeader = Buffer.from(`${apiKey}:`).toString('base64');
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${authHeader}`,
            'X-API-Key': apiKey, // Some APIs use header instead
          },
          body: JSON.stringify(payload),
          timeout: 10000, // 10 second timeout
        });

        const responseText = await response.text();
        let responseData;
        
        try {
          responseData = JSON.parse(responseText);
        } catch {
          responseData = { raw: responseText };
        }
        
        if (!response.ok) {
          console.log('[MAILER] Endpoint failed:', {
            url: apiUrl,
            status: response.status,
            statusText: response.statusText,
            body: responseData,
          });
          lastError = new Error(
            responseData.message || 
            responseData.error || 
            `Mailget API error: ${response.status} ${response.statusText}`
          );
          continue; // Try next endpoint
        }

        console.log('[MAILER] Mailget response', {
          endpoint: apiUrl,
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
      } catch (fetchErr) {
        console.log('[MAILER] Endpoint error:', {
          url: apiUrl,
          error: fetchErr.message,
          code: fetchErr.code,
          cause: fetchErr.cause,
        });
        lastError = fetchErr;
        continue; // Try next endpoint
      }
    }
    
    // If all endpoints failed, throw the last error with more context
    throw new Error(
      `All Mailget API endpoints failed. Last error: ${lastError?.message || 'Unknown error'}. ` +
      `Please check Mailget dashboard for the correct API endpoint and ensure SMTP is configured in Mailget.`
    );
  } catch (err) {
    console.error('[MAILER] Mailget send error', {
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
