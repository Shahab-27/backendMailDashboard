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
      required: true,
      trim: true,
      lowercase: true,
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
      enum: ['inbox', 'sent', 'trash'],
      default: 'inbox',
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

module.exports = mongoose.model('Mail', mailSchema);

