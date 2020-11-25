const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  assigned_by: { type: String },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dateCreated: { type: String },
  dateExpire: { type: String },
  dateWarning: { type: String },
  isWarning: { type: Boolean, default: false },
  isExpired: { type: Boolean, default: false },
  priority: { type: String },
  description: { type: String },
  details: { type: String },
  status: { type: String },
  recurrence: { type: String },
  video_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' },
  history: [{ event: { type: String }, time: { type: String } }],
});

module.exports = mongoose.model('Task', taskSchema);
