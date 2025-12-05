const mongoose = require('mongoose');

const mailSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    from: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    to: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    cc: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    bcc: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    subject: {
      type: String,
      default: '',
      trim: true,
    },
    body: {
      type: String,
      default: '',
      trim: true,
    },
    htmlBody: {
      type: String,
      default: '',
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    isScheduled: {
      type: Boolean,
      default: false,
    },
    attachments: {
      type: [
        {
          url: String,
          fileName: String,
          fileSize: Number,
          fileType: String,
        },
      ],
      default: [],
    },
    folder: {
      type: String,
      enum: ['inbox', 'sent', 'trash', 'drafts', 'scheduled'],
      default: 'inbox',
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

module.exports = mongoose.model('Mail', mailSchema);

