const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { processScheduledEmails } = require('./controllers/mailController');

dotenv.config();

const authRoutes = require('./routes/authRoutes');
const mailRoutes = require('./routes/mailRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

const app = express();

// Database
connectDB();

// Helper to run scheduled email processing (used by both interval + immediate kick)
const runScheduledProcessor = async () => {
  try {
    const req = { body: {}, headers: {} };
    const res = {
      json: (data) => {
        if (data.processed > 0 || data.failed > 0) {
          console.log('[CRON] Scheduled emails processed:', data);
        }
      },
      status: () => res,
    };
    const next = () => {};
    await processScheduledEmails(req, res, next);
  } catch (error) {
    console.error('[CRON] Error processing scheduled emails:', error);
  }
};

// Kick once on startup so demos don't wait for the first tick
runScheduledProcessor();

// Set up automatic scheduled email processing (runs every 60 seconds)
setInterval(runScheduledProcessor, 60000);

console.log('[CRON] Scheduled email processor started (runs every 60s)');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased for file uploads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

app.get('/', (_req, res) => {
  res.json({ status: 'Modern Mail Dashboard API running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/mail', mailRoutes);
app.use('/api/upload', uploadRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.statusCode || 500;
  res.status(status).json({
    message: err.message || 'Internal server error',
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

