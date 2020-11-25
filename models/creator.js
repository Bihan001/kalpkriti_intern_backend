const mongoose = require('mongoose');

const creatorSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  creator_handle: { type: String },
  languages: [{ name: { type: String }, rating: { type: Number } }],
  activeDeal: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' },
  current_deals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }],
  deals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }],
  paymentDetails: {
    upi_id: { type: String },
    payment_phone: { type: String },
    gpay: { type: Boolean, default: false },
    phonepe: { type: Boolean, default: false },
    paytm: { type: Boolean, default: false },
  },
  script: { type: Boolean, default: false },
  paymentDue: { type: Number, default: 0 },
  totalTime: { type: Number, default: 0 },
});

module.exports = mongoose.model('Creator', creatorSchema);
