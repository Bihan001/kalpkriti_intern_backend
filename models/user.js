const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: { type: String },
  middleName: { type: String },
  lastName: { type: String },
  email: { type: String },
  password: { type: String },
  phone: { type: String },
  emailVerified: { type: Boolean, default: false },
  phoneVerified: { type: Boolean, default: false },
  role: { type: String, required: true }, // god, admin, user, customer
  subRole: { type: String },
  permissions: {
    contact_view: {
      type: String,
      default: 'none',
    },
    contact_edit: {
      type: String,
      default: 'none',
    },
    video_view: {
      type: String,
      default: 'none',
    },
    video_edit: {
      type: String,
      default: 'none',
    },
    addUser: {
      type: Boolean,
      default: false,
    },
    contactImport: {
      type: Boolean,
      default: false,
    },
    contactExport: {
      type: Boolean,
      default: false,
    },
    deal_stage_list: [{ type: Number }],
  },
});

module.exports = mongoose.model('User', userSchema);
