const nodemailer = require('nodemailer');

// SMTP environment configuration (works with Gmail app password).
const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpSecure = String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true';
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const fromDefault = process.env.SMTP_FROM || smtpUser;

let transporter = null;

if (smtpHost && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  transporter
    .verify()
    .then(() => {
      console.log('[MAILER] SMTP transporter verified for', smtpUser);
    })
    .catch((err) => {
      console.error('[MAILER] SMTP verify failed', {
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        error: err && err.message,
      });
    });
} else {
  console.warn(
    '[MAILER] SMTP is not fully configured. Please set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS.'
  );
}

const sendMail = async (options = {}) => {
  if (!transporter) {
    const error = new Error('SMTP transporter is not configured');
    error.statusCode = 500;
    throw error;
  }

  const fromAddress = options.from || fromDefault;
  const payload = {
    from: fromAddress,
    to: options.to,
    subject: options.subject,
    html: options.html || `<pre>${options.text || ''}</pre>`,
    text: options.text || options.html,
  };

  console.log('[MAILER] Sending email via SMTP', {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    user: smtpUser,
    to: payload.to,
    subject: payload.subject,
    from: payload.from,
    htmlLength: (payload.html || '').length,
  });

  try {
    const info = await transporter.sendMail(payload);
    console.log('[MAILER] SMTP send result', {
      messageId: info && info.messageId,
      response: info && info.response,
      accepted: info && info.accepted,
      rejected: info && info.rejected,
    });
    return info;
  } catch (err) {
    console.error('[MAILER] SMTP send error', {
      name: err && err.name,
      message: err && err.message,
      code: err && err.code,
      command: err && err.command,
      response: err && err.response,
    });
    throw err;
  }
};

module.exports = {
  sendMail,
  isMailerConfigured: !!transporter,
};

