const express = require('express');
const router = express.Router();
const User = require('../../models/user');
const Contact = require('../../models/contact');
const Video = require('../../models/video');
const Activity = require('../../models/activity');
const Creator = require('../../models/creator');
const SampleVideo = require('../../models/sample_videos');
const Language = require('../../models/language');
const Task = require('../../models/task');
const auth = require('../../middlewares/auth');
const moment = require('moment-timezone');
moment.tz.setDefault('Asia/Kolkata');
const mongoose = require('mongoose');
const config = require('config');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(config.SENDGRID_API_KEY);
const cron = require('node-cron');
const async = require('async');
const axios = require('axios');

const apikey = '256e37ff-0e15-400b-9919-f553f44cff28';

const reqConfig = {
  headers: {
    'Content-Type': 'application/json',
    apikey: apikey,
  },
};

router.post('/createWebhook', async (req, res) => {
  try {
    const { url, events } = req.body;
    const r = await axios.post('https://chat.api.zoko.io/v2/webhook', { url, events }, reqConfig);
    res.status(200).json({ data: { message: 'Success', response: r.data } });
  } catch (err) {
    console.log(err.response.data);
    res.status(400).json('Server Error');
  }
});

router.get('/getWebhooks', async (req, res) => {
  try {
    const r = await axios.get('https://chat.api.zoko.io/v2/webhook', reqConfig);
    res.status(200).json({ data: { message: 'Success', response: r.data } });
  } catch (err) {
    console.log(err.response.data);
    res.status(400).json('Server Error');
  }
});

router.get('/getWebhook/:id', async (req, res) => {
  try {
    const r = await axios.get(`https://chat.api.zoko.io/v2/webhook/${req.params.id}`, reqConfig);
    res.status(200).json({ data: { message: 'Success', response: r.data } });
  } catch (err) {
    console.log(err.response.data);
    res.status(400).json('Server Error');
  }
});

router.put('/updateWebhook/:id', async (req, res) => {
  try {
    const { url, events } = req.body;
    const r = await axios.put(`https://chat.api.zoko.io/v2/webhook/${req.params.id}`, { url, events }, reqConfig);
    res.status(200).json({ data: { message: 'Success', response: r.data } });
  } catch (err) {
    console.log(err.response.data);
    res.status(400).json('Server Error');
  }
});

router.delete('/deleteWebhook/:id', async (req, res) => {
  try {
    const r = await axios.delete(`https://chat.api.zoko.io/v2/webhook/${req.params.id}`, { url, events }, reqConfig);
    res.status(200).json({ data: { message: 'Success', response: r.data } });
  } catch (err) {
    console.log(err.response.data);
    res.status(400).json('Server Error');
  }
});

router.post('/sendGreetingMessage', async (req, res) => {
  try {
    const { phone, templateId } = req.body;
    const r = await axios.post(
      'https://chat.api.zoko.io/v2/message',
      { channel: 'whatsapp', recipient: phone, type: 'template', templateId },
      reqConfig
    );
    res.status(200).json({ data: { message: 'Success', response: r.data } });
  } catch (err) {
    console.log(err.response.data);
    res.status(400).json('Server Error');
  }
});

router.post('/sendTextMessage', async (req, res) => {
  try {
    const { phone, message } = req.body;
    const r = await axios.post(
      'https://chat.api.zoko.io/v2/message',
      { channel: 'whatsapp', recipient: phone, type: 'text', message },
      reqConfig
    );
    res.status(200).json({ data: { message: 'Success', response: r.data } });
  } catch (err) {
    console.log(err.response.data);
    res.status(400).json('Server Error');
  }
});

router.get('/getMessage/:id', async (req, res) => {
  try {
    const r = await axios.get(`https://chat.api.zoko.io/v2/message/${req.params.id}`, reqConfig);
    res.status(200).json({ data: { message: 'Success', response: r.data } });
  } catch (err) {
    console.log(err.response.data);
    res.status(400).json('Server Error');
  }
});

router.get('/getMessageHistory/:id', async (req, res) => {
  try {
    const r = await axios.get(`https://chat.api.zoko.io/v2/message/${req.params.id}/history`, reqConfig);
    res.status(200).json({ data: { message: 'Success', response: r.data } });
  } catch (err) {
    console.log(err.response.data);
    res.status(400).json('Server Error');
  }
});

router.delete('/getMessage/:id', async (req, res) => {
  try {
    const r = await axios.delete(`https://chat.api.zoko.io/v2/message/${req.params.id}`, reqConfig);
    res.status(200).json({ data: { message: 'Success', response: r.data } });
  } catch (err) {
    console.log(err.response.data);
    res.status(400).json('Server Error');
  }
});

router.get('/getTemplates', async (req, res) => {
  try {
    const r = await axios.get(`https://chat.api.zoko.io/v2/account/templates`, reqConfig);
    res.status(200).json({ data: { message: 'Success', response: r.data } });
  } catch (err) {
    console.log(err.response.data);
    res.status(400).json('Server Error');
  }
});

router.get('/getCustomers', async (req, res) => {
  try {
    const r = await axios.get(`https://chat.api.zoko.io/v2/customer/?channel=whatsapp`, reqConfig);
    res.status(200).json({ data: { message: 'Success', response: r.data } });
  } catch (err) {
    console.log(err.response.data);
    res.status(400).json('Server Error');
  }
});

router.get('/getCustomer/:id', async (req, res) => {
  try {
    const r = await axios.get(`https://chat.api.zoko.io/v2/customer/${req.params.id}`, reqConfig);
    res.status(200).json({ data: { message: 'Success', response: r.data } });
  } catch (err) {
    console.log(err.response.data);
    res.status(400).json('Server Error');
  }
});

module.exports = router;
