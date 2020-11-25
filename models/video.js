const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  videoName: { type: String, required: true },
  videoDuration: { type: String },
  video_rating: { type: Number },
  service_rating: { type: Number },
  videoSales: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  videoOperator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  videoAmount: { type: Number },
  advancedPayment: { type: Number },
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, //Creator
  task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  language: { type: String, required: true },
  images: [{ type: String }],
  script: { type: String },
  video_links: [{ type: String }],
  deal_stage: { type: Number, required: true },
  pastActivityTime: { type: String },
  nextActivityTime: { type: String },
  timeRequired: { type: String },
  dateCreated: { type: String },
});

module.exports = mongoose.model('Video', videoSchema);
