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

  console.log('[MAILER] Sending email via Resend', {
    to: options.to,
    subject: options.subject,
    from: fromAddress,
  });

  const result = await resendClient.emails.send({
    from: fromAddress,
    to: options.to,
    subject: options.subject,
    html: options.html || `<pre>${options.text || ''}</pre>`,
  });

  console.log('[MAILER] Resend response', result);

  return result;
};

module.exports = {
  sendMail,
  isMailerConfigured: !!resendClient,
};

