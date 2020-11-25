const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  video_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String },
  status: { type: String },
  time: { type: String, required: true },
  description: { type: String },
  completeComment: { type: String },
});

module.exports = mongoose.model('Activity', activitySchema);
