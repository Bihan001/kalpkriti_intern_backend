const mongoose = require('mongoose');

const languageSchema = new mongoose.Schema({
  languageName: { type: String },
});

module.exports = mongoose.model('Language', languageSchema);
