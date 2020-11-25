const express = require('express');
const router = express.Router();
const User = require('../../models/user');
const jwt = require('jsonwebtoken');
const config = require('config');
const auth = require('../../middlewares/auth');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(config.SENDGRID_API_KEY);

router.get('/getUser', auth, async (req, res) => {
  try {
    const id = req.user.id;
    const user = await User.findById(id);
    if (!user) return res.status(400).json({ data: { error: 'User not found' } });
    return res.status(200).json({ data: { message: 'Success', user: user } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/createGod', async (req, res) => {
  try {
    const { firstName, middleName, lastName, email, password, phone } = req.body;
    const chk = await User.findOne({ email });
    if (chk) return res.status(400).json({ data: { error: 'Email already exists' } });

    var user = new User({
      firstName: !firstName ? '' : firstName,
      middleName: !middleName ? '' : middleName,
      lastName: !lastName ? '' : lastName,
      email: !email ? '' : email,
      password: !password ? '' : password,
      phone: !phone ? 0 : phone,
      role: 'god',
      permissions: {
        contact_view: 'all',
        contact_edit: 'all',
        video_view: 'all',
        video_edit: 'all',
        addUser: true,
        contactImport: true,
        contactExport: true,
      },
    });

    await user.save();
    return res.status(200).json({ data: { message: 'Success', user: user } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/createUser', auth, async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      email,
      password,
      phone,
      role,
      subRole,
      contact_view,
      contact_edit,
      video_view,
      video_edit,
      addUser,
      contactImport,
      contactExport,
      deal_stage_list,
    } = req.body;
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) return res.status(400).json({ data: { error: 'User authentication failed' } });
    if (currentUser.role != 'god')
      return res.status(400).json({ data: { error: 'You dont have permissions for that' } });
    if (role !== 'customer') {
      if (!email) return res.status(401).json({ data: { error: 'Enter an email' } });
      const chk = await User.findOne({ email });
      if (chk) return res.status(400).json({ data: { error: 'Email already exists' } });
    }

    var user = new User({
      firstName: !firstName ? '' : firstName,
      middleName: !middleName ? '' : middleName,
      lastName: !lastName ? '' : lastName,
      email: !email ? '' : email,
      password: !password ? '' : password,
      phone: !phone ? 0 : phone,
      role,
      subRole,
      permissions: {
        contact_view: contact_view,
        contact_edit: contact_edit,
        video_view: video_view,
        video_edit: video_edit,
        addUser: addUser,
        contactImport: contactImport,
        contactExport: contactExport,
        deal_stage_list: deal_stage_list.map((d) => Number(d)),
      },
    });

    await user.save();
    jwt.sign(
      { user: { email: user.email } },
      config.EMAIL_JWT_SECRET,
      {
        expiresIn: '1d',
      },
      (err, token) => {
        if (err) throw err;
        const msg = {
          to: user.email,
          from: 'kalpkriti@gmail.com',
          subject: 'Kalpkriti Invitation',
          text: `Click this link to verify your email and complete your account ${config.FHOST}/completeAccount/${token}`,
        };
        sgMail.send(msg).then(
          res.status(200).json({
            data: { message: 'Confirmation email Sent', user: user },
          })
        );
      }
    );
    return res.status(200).json({ data: { message: 'Success', user: user } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ data: { error: 'No account found' } });
    if (user.role != 'god')
      if (user.emailVerified == false || user.password == '')
        return res.status(400).json({ data: { error: 'Not Verified', user: user } });
    if (user.password != password) return res.status(401).json({ data: { error: 'Wrong Password' } });
    jwt.sign(
      { user: { id: user.id } },
      config.JWT_SECRET,
      {
        expiresIn: '8760h',
      },
      (err, token) => {
        if (err) throw err;
        res.json({ data: { message: 'Success', token: token } });
      }
    );
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/completeAccount/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { firstName, middleName, lastName, password, phone } = req.body;
    const email = jwt.verify(token, config.EMAIL_JWT_SECRET).user.email;
    var user = await User.findOne({ email });
    if (!user) return res.status(401).json({ data: { error: 'No account found' } });
    if ((!password || password.length < 8) && (!firstName || !lastName))
      return res.status(401).json({ data: { error: 'Fill the fields properly' } });
    user.firstName = firstName ? firstName : '';
    user.middleName = middleName ? middleName : '';
    user.lastName = lastName ? lastName : '';
    user.password = password ? password : '';
    user.phone = phone ? phone : '';
    user.emailVerified = true;
    await user.save();
    return res.status(200).json({ data: { message: 'Success', user: user } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/changePassword', auth, async (req, res) => {
  try {
    const password = req.body.password;
    var user = await User.findById(req.user.id);
    user.password = password;
    await user.save();
    return res.status(200).json({ data: { message: 'Success' } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/editUser', auth, async (req, res) => {
  try {
    const deal_stage_list = req.body.deal_stage_list;
    const email = req.body.email;
    var user = await User.findOne({ email });
    user.permissions.deal_stage_list = deal_stage_list;
    await user.save();
    console.log(deal_stage_list);
    return res.status(200).json({ data: { message: 'Success', user: user } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/forgotPassword/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user || !user.emailVerified || !user.password)
      return res.status(401).json({ data: { error: 'No account found' } });
    console.log('email');
    jwt.sign(
      { user: { email: user.email } },
      config.EMAIL_JWT_SECRET,
      {
        expiresIn: '1d',
      },
      (err, token) => {
        if (err) throw err;
        const msg = {
          to: user.email,
          from: 'kalpkriti@gmail.com',
          subject: 'Kalpkriti CRM Password Reset Verification',
          text: `Click this link to verify your email and reset your password ${config.FHOST}/resetPassword/${token}`,
        };
        sgMail.send(msg).then(
          res.status(200).json({
            data: { message: 'Password reset email Sent', user: user },
          })
        );
      }
    );
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/resetPassword/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    const email = jwt.verify(token, config.EMAIL_JWT_SECRET).user.email;
    var user = await User.findOne({ email });
    if (!user) return res.status(401).json({ data: { error: 'No account found' } });
    user.password = password;
    await user.save();
    res.status(200).json({
      data: { message: 'Password reset done', user: user },
    });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

module.exports = router;
