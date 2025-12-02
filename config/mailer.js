const nodemailer = require('nodemailer');

const REQUIRED_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];

const hasAllEnv = REQUIRED_ENV.every((key) => !!process.env[key]);

let transporter;

if (hasAllEnv) {
  const transportOptions = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure:
      (process.env.SMTP_SECURE || '').toLowerCase() === 'true' ||
      Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };

  console.log('[MAILER] Creating SMTP transport with options:', {
    host: transportOptions.host,
    port: transportOptions.port,
    secure: transportOptions.secure,
    user: transportOptions.auth.user,
  });

  transporter = nodemailer.createTransport(transportOptions);

  transporter
    .verify()
    .then(() => {
      console.log('[MAILER] SMTP connection verified successfully');
    })
    .catch((error) => {
      console.warn('[MAILER] SMTP verification failed:', error.message);
    });
} else {
  console.warn('[MAILER] SMTP env vars missing; outgoing email disabled', {
    hasAllEnv,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    hasPass: !!process.env.SMTP_PASS,
  });
}

const sendMail = async (options = {}) => {
  if (!transporter) {
    const error = new Error('SMTP transport is not configured');
    error.statusCode = 500;
    throw error;
  }

  const fromAddress = options.from || process.env.SMTP_FROM || process.env.SMTP_USER;

  console.log('[MAILER] Sending email', {
    to: options.to,
    subject: options.subject,
    from: fromAddress,
  });

  const result = await transporter.sendMail({
    ...options,
    from: fromAddress,
  });

  console.log('[MAILER] Email sent', {
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected,
    response: result.response,
  });

  return result;
};

module.exports = {
  sendMail,
  isMailerConfigured: !!transporter,
};


