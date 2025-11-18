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
    folder: {
      type: String,
      enum: ['inbox', 'sent', 'trash', 'drafts'],
      default: 'inbox',
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

module.exports = mongoose.model('Mail', mailSchema);

