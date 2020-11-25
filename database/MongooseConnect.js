const config = require('config');
const mongoose = require('mongoose');

module.exports = () =>
  mongoose
    .connect(config.DATABASE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
    })
    .then((res) => {
      console.log('Database Connection Successful');
    })
    .catch((err) => {
      console.log('Database not connected ' + err);
    });
