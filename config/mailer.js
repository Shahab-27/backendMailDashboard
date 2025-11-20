const nodemailer = require('nodemailer');

const REQUIRED_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];

const hasAllEnv = REQUIRED_ENV.every((key) => !!process.env[key]);

let transporter;

if (hasAllEnv) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure:
      (process.env.SMTP_SECURE || '').toLowerCase() === 'true' ||
      Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  transporter.verify().catch((error) => {
    console.warn('SMTP verification failed:', error.message);
  });
} else {
  console.warn('SMTP env vars missing; outgoing email disabled');
}

const sendMail = async (options = {}) => {
  if (!transporter) {
    const error = new Error('SMTP transport is not configured');
    error.statusCode = 500;
    throw error;
  }

  const fromAddress = options.from || process.env.SMTP_FROM || process.env.SMTP_USER;

  return transporter.sendMail({
    ...options,
    from: fromAddress,
  });
};

module.exports = {
  sendMail,
  isMailerConfigured: !!transporter,
};


