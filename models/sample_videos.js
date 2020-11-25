const mongoose = require('mongoose');

const SampleVideoSchema = new mongoose.Schema({
  videoName: { type: String, required: true },
  url: { type: String, required: true },
  thumbnail: { type: String },
  language: { type: String, required: true },
  category: { type: String, required: true },
});

module.exports = mongoose.model('SampleVideo', SampleVideoSchema);
