// Imports
const express = require('express');
const fs = require('fs');
const https = require('https');
const http = require('http');

const app = express();
const bodyParser = require('body-parser');
const config = require('config');
const cors = require('cors');
const mongooseConnect = require('./database/MongooseConnect');
const busboy = require('connect-busboy');
const busboyBodyParser = require('busboy-body-parser');

const options = {
  cert: fs.readFileSync(config.CERT_PATH),
  key: fs.readFileSync(config.KEY_PATH),
  ca: config.has('CA') ? [fs.readFileSync(config.CA)] : null,
};

httpServer = http.createServer(app);
httpsServer = https.createServer(options, app);

// Initialization
mongooseConnect();
const PORT = config.PORT || 5000;

// Middlewares
app.use(busboy());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());
app.use(busboyBodyParser());

// Routes
app.use((req, res, next) => {
  if (req.protocol === 'http') {
    console.log(req.headers.host);
    res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

app.use('/', require('./routes/api/routes'));
app.use('/zoko/', require('./routes/api/zoko'));
app.use('/user/', require('./routes/api/users'));

// Listen
// app.listen(PORT, () => {
//   console.log(`Listening on PORT ${PORT}`);
// });

httpServer.listen(5000);
httpsServer.listen(PORT, () => {
  console.log(`Listening on PORT ${PORT}`);
});
