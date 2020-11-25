const mongoose = require('mongoose');
const moment = require('moment');

const contactSchema = new mongoose.Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  zoko_id: { type: String },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  wallet: { type: Number, default: 0 },
  wallet_history: [
    {
      reciept: { type: String },
      amount: { type: Number },
      date: { type: String },
    },
  ],
  convertedCustomer: { type: Boolean },
  happyCustomer: { type: Boolean },
  repeatedCustomer: { type: Boolean },
  touched: [{ date: { type: String }, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } }],
  expectedVideos: { type: Number },
  lostUser: { isLost: { type: Boolean }, lostReason: { type: String } },
  video_ongoing: { type: Boolean, default: false },
  no_of_videos: { type: Number, default: 0 },
  video_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }],
  history: [{ type: String }],
  date_created: { type: String, default: moment().format() },
  update_date: { type: String },
  waitDate: { type: String },
  business: { type: String },
  lead_status: { type: String },
});

module.exports = mongoose.model('Contact', contactSchema);
