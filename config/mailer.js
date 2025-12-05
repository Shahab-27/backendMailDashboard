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
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000, // 10 seconds
    socketTimeout: 10000, // 10 seconds
    tls: {
      rejectUnauthorized: false, // Allow self-signed certificates if needed
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
        code: err && err.code,
        command: err && err.command,
      });
      console.error('[MAILER] Troubleshooting tips:');
      console.error('  1. Check if SMTP_PORT is correct (465 for SSL, 587 for STARTTLS)');
      console.error('  2. Check if SMTP_SECURE matches the port (true for 465, false for 587)');
      console.error('  3. Verify firewall/network allows outbound connections on port', smtpPort);
      console.error('  4. Ensure Gmail App Password is correct (not regular password)');
      console.error('  5. Try port 465 with SMTP_SECURE=true if 587 fails');
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

