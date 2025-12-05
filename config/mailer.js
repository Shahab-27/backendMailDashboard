const { Resend } = require('resend');

// We use Resend HTTP API instead of SMTP so it works on Render free tier.
// Required env vars:
// - RESEND_API_KEY  (never hard-code this in the repo)
// - RESEND_FROM     (e.g. "Modern Mail <onboarding@resend.dev>")

const apiKey = process.env.RESEND_API_KEY;
const fromDefault = process.env.RESEND_FROM || 'onboarding@resend.dev';

let resendClient = null;

if (apiKey) {
  resendClient = new Resend(apiKey);
  console.log('[MAILER] Resend client initialized');
} else {
  console.warn('[MAILER] RESEND_API_KEY is missing; outgoing email disabled');
}

const sendMail = async (options = {}) => {
  if (!resendClient) {
    const error = new Error('Resend client is not configured');
    error.statusCode = 500;
    throw error;
  }

  const fromAddress = options.from || fromDefault;
  const payload = {
    from: fromAddress,
    to: options.to,
    subject: options.subject,
    html: options.html || `<pre>${options.text || ''}</pre>`,
  };

  console.log('[MAILER] Sending email via Resend', {
    to: payload.to,
    subject: payload.subject,
    from: payload.from,
    htmlLength: (payload.html || '').length,
  });

  try {
    const result = await resendClient.emails.send(payload);
    console.log('[MAILER] Resend response', result);
    return result;
  } catch (err) {
    console.error('[MAILER] Resend send error', {
      name: err && err.name,
      message: err && err.message,
      statusCode: err && err.statusCode,
      responseBody: err && err.response && err.response.body,
    });
    throw err;
  }
};

module.exports = {
  sendMail,
  isMailerConfigured: !!resendClient,
};

