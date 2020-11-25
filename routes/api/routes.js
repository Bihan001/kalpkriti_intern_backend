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
const aws = require('aws-sdk');
const moment = require('moment-timezone');
moment.tz.setDefault('Asia/Kolkata');
const mongoose = require('mongoose');
const config = require('config');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(config.SENDGRID_API_KEY);
const Busboy = require('busboy');
const cron = require('node-cron');
const async = require('async');

var ORANGE_COUNT = 0;
var RED_COUNT = 0;
var PREV_ORANGE = 0;
var PREV_RED = 0;
var ADVANCED_PAYMENT = 400;
var END_OF_DAY = 19;
var START_OF_DAY = 10;

var times = [
  { c: 4, s: 3 },
  { c: 8, s: 4 },
  { c: 12, s: 8 },
  { c: 8, s: 4 },
  { c: 0, s: 12 },
  { c: 6, s: 3 },
  { c: 0, s: 8 },
  { c: 8760, s: 8760 },
  { c: 8760, s: 8760 },
];

const getTaskExpiryDate = (inRequireTime) => {
  var tmp = inRequireTime;
  var dayCount = 0;
  var availableTime = moment().hour(END_OF_DAY).minute(0).subtract(moment().hour(), 'h').hour();
  while (availableTime < tmp) {
    tmp -= availableTime;
    dayCount += 1;
    if (moment().add(dayCount, 'd').day() === 0) dayCount += 1;
    availableTime = moment().hour(END_OF_DAY).minute(0).subtract(START_OF_DAY, 'h').hour();
  }
  return dayCount === 0
    ? moment().add(dayCount, 'd').add(tmp, 'h').format()
    : moment().add(dayCount, 'd').hour(START_OF_DAY).minute(0).add(tmp, 'h').format();
};

const createTask = async (assigned_to, assigned_by, priority, description, details, recurrence, video_id) => {
  try {
    var task = new Task({
      assigned_by,
      assigned_to: mongoose.Types.ObjectId(assigned_to),
      priority,
      description,
      details,
      status: 'pending',
      recurrence,
      video_id: video_id ? mongoose.Types.ObjectId(video_id) : null,
      dateCreated: moment().format(),
    });
    await task.save();
    if (video_id) {
      var vid = await Video.findById(video_id);
      vid.task_id = task._id;
      await vid.save();
      task.dateWarning = getTaskExpiryDate(times[vid.deal_stage].s);
      task.dateExpire = getTaskExpiryDate(times[vid.deal_stage].c);
      task.history.unshift({ event: 'Task created', time: moment().format() });
      await task.save();
    }
  } catch (err) {
    console.log(err);
  }
};

const setTaskTimes = async (video) => {
  try {
    var task = await Task.findById(video.task_id);
    if (!task) return null;
    if (moment().isAfter(moment(task.dateWarning))) {
      task.isWarning = true;
    }
    if (moment().isAfter(moment(task.dateExpire))) {
      task.isExpired = true;
    }
    await task.save();
  } catch (err) {
    console.log(err);
  }
};

const setUserTaskTimes = async () => {
  try {
    var tasks = await Task.find({});
    if (!tasks) return null;
    await async.forEachOf(tasks, async (task, i) => {
      if (
        tasks[i].dateExpire !== undefined &&
        tasks[i].dateExpire !== null &&
        moment().isAfter(moment(tasks[i].dateExpire))
      ) {
        tasks[i].isExpired = true;
        tasks[i].priority !== 'high'
          ? tasks[i].history.unshift({
              event: 'Task priority changed to high',
              time: moment().format(),
            })
          : null;
        tasks[i].priority = 'high';
      }
      await tasks[i].save();
    });
  } catch (err) {
    console.log(err);
  }
};

cron.schedule('0 */1 * * * *', async () => {
  var videos = await Video.find({}).lean();
  await setUserTaskTimes();
  if (!videos) return res.status(400).json({ data: { error: 'Cannot find videos' } });
  async.each(videos, async (video) => {
    setTaskTimes(video);
  });
});

const recalculateVideoStates = async (videos) => {
  ORANGE_COUNT = 0;
  RED_COUNT = 0;
  await async.forEachOf(videos, async (video, i) => {
    var task = await Task.findById(videos[i].task_id);
    if (task) {
      if (task.isExpired && task.isExpired === true) {
        videos[i]['idle'] = 'red';
        RED_COUNT += 1;
        task.priority !== 'high'
          ? task.history.unshift({
              event: 'Task priority changed to high',
              time: moment().format(),
            })
          : null;
        task.priority = 'high';
      } else if (task.isWarning && task.isWarning === true) {
        videos[i]['idle'] = 'orange';
        ORANGE_COUNT += 1;
        task.priority !== 'medium'
          ? task.history.unshift({
              event: 'Task priority changed to medium',
              time: moment().format(),
            })
          : null;
        task.priority = 'medium';
      }
      await task.save();
    }
  });
};

router.get('/', (req, res) => {
  res.send('Hello World!');
});

router.get('/getTest', (req, res) => {
  console.log('GET', req.params, req.body, req.headers);
  res.status(200).send('Success');
});

router.post('/postTest', (req, res) => {
  console.log('POST', req.params, req.body, req.headers);
  res.status(200).send('Success');
});

router.get('/getAllInfo', async (req, res) => {
  try {
    const users = await User.find({});
    const contacts = await Contact.find({});
    const videos = await Video.find({});
    const activities = await Activity.find({});
    const tasks = await Task.find({});
    const creators = await Creator.find({});
    res.status(200).json({
      data: {
        message: 'Success',
        users: users,
        contacts: contacts,
        videos: videos,
        activities: activities,
        tasks: tasks,
        creators: creators,
      },
    });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/createCustomer', async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      email,
      phone,
      business,
      repeatedCustomer,
      happyCustomer,
      convertedCustomer,
    } = req.body;
    if (!firstName) return res.status(400).json({ data: { error: 'Enter customer first name' } });
    if (phone) {
      const chk = await User.findOne({ phone });
      if (chk) return res.status(400).json({ data: { error: 'Phone already exists' } });
    } else {
      return res.status(400).json({ data: { error: 'No Phone number found' } });
    }
    var user = new User({
      firstName,
      middleName: !middleName ? '' : middleName,
      lastName: !lastName ? '' : lastName,
      phone: !phone ? '' : phone,
      email: !email ? '' : email,
      role: 'customer',
    });
    await user.save();
    var customer = new Contact({
      customer_id: user._id,
      repeatedCustomer,
      happyCustomer,
      convertedCustomer,
      business: !business ? '' : business,
      lead_status: 'new',
      update_date: moment().format(),
    });
    await customer.save();
    createTask(
      '5f1bffa3cdd4ca5bd3e0d833',
      'SYSTEM_CUST',
      'high',
      'Contact new customer',
      `Contact ${firstName} ${middleName} ${lastName}, number: ${phone}`,
      'none'
    );
    res.status(200).json({ data: { message: 'Success', user: user, customer: customer } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/createCustomerFromZoko', async (req, res) => {
  try {
    const { customer, senderName } = req.body;
    console.log(customer, senderName);
    const chk = await User.findOne({ phone: customer.name });
    if (chk) return res.status(200).send('Customer already exists');
    let arr = senderName.split(' ');
    let firstName = arr[0];
    let tmp = arr.splice(1);
    let lastName = tmp.join(' ');
    var user = new User({
      firstName,
      middleName: '',
      lastName: lastName ? lastNme : '',
      phone: customer.name,
      email: '',
      role: 'customer',
    });
    await user.save();
    var contact = new Contact({
      customer_id: user._id,
      zoko_id: customer.id,
      lead_status: 'new',
      update_date: moment().format(),
    });
    await contact.save();
    res.status(200).send('Success');
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getCustomer/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    // if (chk.role != 'god' && chk.permissions.contact_view == 'none')
    //   return res.status(403).json({ data: { error: 'Not permitted' } });
    const user = await User.findById(id);
    const contact = await Contact.findOne({ customer_id: id });
    if (!user || !contact) return res.status(400).json({ data: { error: 'Customer not found' } });
    if (
      chk.role != 'god' &&
      chk.permissions.contact_view == 'assigned' &&
      String(contact.assigned_to) != String(chk._id)
    ) {
      return res.status(403).json({ data: { error: 'Not assigned to you' } });
    }
    const customer = {
      id: user._id,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      email: user.email,
      password: user.password,
      phone: user.phone,
      role: user.role,
      wallet: contact.wallet,
      wallet_history: contact.wallet_history,
      videos: contact.video_ids,
      happyCustomer: contact.happyCustomer,
      repeatedCustomer: contact.repeatedCustomer,
      convertedCustomer: contact.convertedCustomer,
      expectedVideos: contact.expectedVideos,
      lostUser: contact.lostUser,
      no_of_videos: contact.no_of_videos,
      touches: contact.touched,
    };
    return res.status(200).json({ data: { message: 'Success', customer: customer } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/getCustomers', auth, async (req, res) => {
  const { lead_status, dateStart, dateEnd, happy, repeated, videoOngoing, filter, touchStart, touchEnd } = req.body;
  var date_begin = dateStart ? moment(dateStart, 'YYYY-MM-DDThh:mm') : null;
  var date_end = dateEnd ? moment(dateEnd, 'YYYY-MM-DDThh:mm') : null;
  if (!(date_begin && date_end) && !(!date_begin && !date_end))
    return res.status(400).json({ data: { error: 'Specify proper dates' } });
  if (!(touchStart && touchEnd) && !(!touchStart && !touchEnd))
    return res.status(400).json({ data: { error: 'Specify proper dates' } });
  var isHappy = happy == 'true' ? true : happy == 'false' ? false : null;
  var isRepeated = repeated == 'true' ? true : repeated == 'false' ? false : null;
  var video_ongoing = videoOngoing == 'true' ? true : videoOngoing == 'false' ? false : null;
  try {
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.contact_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    var users = await User.find({ role: 'customer' });
    var contacts = await Contact.find({}).populate('customer_id');
    var customers = [];

    if (chk.permissions.contact_view === 'assigned')
      contacts = contacts.filter((contact) => String(contact.assigned_to) == String(chk._id));
    contacts = contacts.filter(
      (c) =>
        (lead_status ? (c.lead_status == lead_status ? true : false) : true) &&
        (isHappy !== null ? c.happyCustomer == isHappy : true) &&
        (isRepeated !== null ? c.repeatedCustomer == isRepeated : true) &&
        (video_ongoing !== null ? c.video_ongoing == video_ongoing : true) &&
        (date_begin && date_end
          ? c.update_date && moment(c.update_date, 'YYYY-MM-DDThh:mm').isBetween(date_begin, date_end)
          : true) &&
        (!filter
          ? true
          : c.customer_id.firstName.toUpperCase().indexOf(filter) > -1 ||
            c.customer_id.middleName.toUpperCase().indexOf(filter) > -1 ||
            c.customer_id.lastName.toUpperCase().indexOf(filter) > -1 ||
            c.customer_id.phone.toUpperCase().indexOf(filter) > -1) &&
        (touchStart && touchEnd
          ? c.touched.filter((t) => moment(t.date, 'YYYY-MM-DDThh:mm').isBetween(touchStart, touchEnd)).length > 0
          : true)
    );

    for (let i = 0; i < users.length; i++) {
      for (let j = 0; j < contacts.length; j++) {
        if (String(users[i]._id) === String(contacts[j].customer_id._id)) {
          customers.unshift({
            id: users[i]._id,
            firstName: users[i].firstName,
            middleName: users[i].middleName,
            lastName: users[i].lastName,
            email: users[i].email,
            password: users[i].password,
            phone: users[i].phone,
            role: users[i].role,
            wallet: contacts[j].wallet,
            wallet_history: contacts[j].wallet_history,
            videos: contacts[j].video_ids,
            happyCustomer: contacts[j].happyCustomer,
            repeatedCustomer: contacts[j].repeatedCustomer,
            convertedCustomer: contacts[j].convertedCustomer,
            expectedVideos: contacts[j].expectedVideos,
            lostUser: contacts[j].lostUser,
            no_of_videos: contacts[j].no_of_videos,
            lead_status: contacts[j].lead_status,
            touches: contacts[j].touched,
          });
        }
      }
    }
    return res.status(200).json({
      data: {
        message: 'Success',
        length: customers.length,
        customers: customers,
      },
    });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/editCustomer', auth, async (req, res) => {
  try {
    const {
      id,
      firstName,
      middleName,
      lastName,
      email,
      password,
      phone,
      role,
      video_id,
      lead_status,
      waitDate,
    } = req.body;
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.contact_edit == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });
    var user = await User.findById(id);
    var contact = await Contact.findOne({ customer_id: id });
    if (!user || !contact) return res.status(400).json({ data: { error: 'Customer not found' } });
    if (
      chk.role != 'god' &&
      chk.permissions.contact_edit == 'assigned' &&
      String(contact.assigned_to) != String(chk._id)
    ) {
      return res.status(403).json({ data: { error: 'Not assigned to you' } });
    }
    if (firstName) user.firstName = firstName;
    if (middleName) user.middleName = middleName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (password) user.password = password;
    if (phone) user.phone = phone;
    if (role) user.role = role;
    if (video_id) contact.video_ids.unshift(video_id);
    if (lead_status) {
      if (lead_status == 'wait' && !waitDate) return res.status(400).json({ data: { error: 'Specify wait date' } });
      contact.lead_status = lead_status;
      contact.update_date = moment().format();
      if (lead_status == 'wait') contact.waitDate = moment(waitDate, 'YYYY-MM-DDThh:mm').format();
    }
    await user.save();
    await contact.save();
    const customer = {
      id: user._id,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      email: user.email,
      password: user.password,
      phone: user.phone,
      role: user.role,
      wallet: contact.wallet,
      videos: contact.video_ids,
    };
    return res.status(200).json({ data: { message: 'Success', customer: customer } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.delete('/deleteAllCustomers', auth, async (req, res) => {
  try {
    await User.deleteMany({ role: 'customer' });
    await Contact.deleteMany({});
    await Video.deleteMany({});
    await Activity.deleteMany({});
    res.status(200).json({ data: { message: 'Deleted All' } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.delete('/deleteCustomer/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    await Contact.findOneAndDelete({ customer_id: id });
    await Video.deleteMany({ customer_id: id });
    res.status(200).json({ data: { message: 'Deleted customer' } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

const uploadReciept = (file, amount, contact, user, res) => {
  const s3bucket = new aws.S3({
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    Bucket: config.BUCKET_NAME,
  });
  s3bucket.createBucket(function () {
    var params = {
      Bucket: config.BUCKET_NAME,
      Key: `reciepts/${user._id}/${Date.now()}_${file.name}`,
      Body: file.data,
      ACL: 'public-read',
    };
    s3bucket.upload(params, async function (err, data) {
      if (err) {
        console.log('AWS S3 error in callback');
        console.log(err.message);
      }
      try {
        console.log('Reciept uploaded');
        console.log(data);
        contact.wallet_history.unshift({
          reciept: data.Location,
          amount,
          date: moment().format(),
        });
        contact.wallet += Number(amount);
        contact.video_ongoing = true;
        await contact.save();
        const customer = {
          id: user._id,
          firstName: user.firstName,
          middleName: user.middleName,
          lastName: user.lastName,
          email: user.email,
          password: user.password,
          phone: user.phone,
          role: user.role,
          wallet: contact.wallet,
          videos: contact.video_ids,
        };
        return res.status(200).json({ data: { message: 'Success', customer: customer } });
      } catch (err) {
        console.log(err.message);
      }
    });
  });
};

router.post('/addMoney', auth, async (req, res) => {
  try {
    const { file } = req.files;
    const { id, amount } = req.body;
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.contact_edit == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    var user = await User.findById(id);
    var contact = await Contact.findOne({ customer_id: id });
    if (!user || !contact) return res.status(400).json({ data: { error: 'Customer not found' } });
    if (
      chk.role != 'god' &&
      chk.permissions.contact_edit == 'assigned' &&
      String(contact.assigned_to) != String(chk._id)
    ) {
      return res.status(403).json({ data: { error: 'Not assigned to you' } });
    }

    if (contact.wallet + Number(amount) < 0)
      return res.status(400).json({ data: { error: 'Cannot have negative value' } });

    var busboy = new Busboy({ headers: req.headers });
    busboy.on('finish', () => {
      console.log(file);
      uploadReciept(file, amount, contact, user, res);
    });
    req.pipe(busboy);
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/newVideo', auth, async (req, res) => {
  try {
    const {
      videoName,
      videoDuration,
      videoAmount,
      advancedPayment,
      customer_id,
      assigned_to,
      videoOperator,
      language,
      images,
      script,
      video_links,
    } = req.body;
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_edit == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });
    var contact = await Contact.findOne({ customer_id }).populate('customer_id');
    if (!contact) return res.status(400).json({ data: { error: 'Cannot find customer' } });

    const lang = await Language.findOne({ languageName: language });
    if (!lang) return res.status(200).json({ data: { error: 'No such language' } });

    var creator = await Creator.findOne({ user_id: assigned_to }).populate('user_id');
    if (!creator) return res.status(400).json({ data: { error: 'No creator found' } });

    if (creator.totalTime < times[0].s) return res.status(400).json({ data: { error: 'No time for creator' } });

    var video = new Video({
      videoName,
      videoDuration,
      videoAmount: videoAmount ? videoAmount : 0,
      advancedPayment: advancedPayment ? advancedPayment : 0,
      customer_id,
      videoSales: mongoose.Types.ObjectId(req.user.id),
      videoOperator: mongoose.Types.ObjectId(videoOperator),
      assigned_to: mongoose.Types.ObjectId(assigned_to),
      language,
      images,
      script,
      video_links,
      deal_stage: 0,
      dateCreated: moment().format(),
    });
    await video.save();
    createTask(
      req.user.id,
      'system',
      'low',
      `${videoName}: New video created`,
      `Customer(${contact.customer_id.firstName} ${contact.customer_id.middleName} ${contact.customer_id.lastName}): ${contact.customer_id.phone}  Creator(${creator.user_id.firstName} ${creator.user_id.middleName} ${creator.user_id.lastName}): ${creator.user_id.phone}`,
      'none',
      video._id
    );
    creator.current_deals.unshift(mongoose.Types.ObjectId(video._id));
    creator.totalTime -= times[0].s;
    await creator.save();
    contact.wallet -= 400;
    contact.video_ids.unshift(video._id);
    contact.no_of_videos += 1;
    contact.video_ongoing = true;
    await contact.save();
    return res.status(200).json({ data: { message: 'Success', video: video, customer: contact } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getVideo/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });
    const video = await Video.findById(id);
    if (!video) return res.status(400).json({ data: { error: 'Cannot find video' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'assigned' && String(video.assigned_to) != String(chk._id)) {
      return res.status(403).json({ data: { error: 'Not assigned to you' } });
    }
    return res.status(200).json({ data: { message: 'Success', video: video } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getVideos', auth, async (req, res) => {
  try {
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    var videos = await Video.find({}).lean();
    if (!videos) return res.status(400).json({ data: { error: 'Cannot find videos' } });

    if (chk.permissions.video_view === 'assigned')
      videos = videos.filter((vid) => String(vid.assigned_to) == String(chk._id));

    for (let i = 0; i < videos.length; i++) {
      videos[i].timeRequired = times[videos[i].deal_stage];
    }

    await recalculateVideoStates(videos);

    return res.status(200).json({
      data: {
        message: 'Success',
        length: videos.length,
        orange_count: ORANGE_COUNT,
        red_count: RED_COUNT,
        videos: videos,
      },
    });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/editVideo', auth, async (req, res) => {
  try {
    const { id, videoName, videoDuration } = req.body;
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    var video = await Video.findById(id);
    if (!video) return res.status(400).json({ data: { error: 'Cannot find video' } });

    if (chk.role != 'god' && chk.permissions.video_edit == 'assigned' && String(video.assigned_to) != String(chk._id)) {
      return res.status(403).json({ data: { error: 'Not assigned to you' } });
    }

    if (chk.role !== 'god' && !chk.permissions.deal_stage_list.includes(video.deal_stage)) {
      return res.status(400).json({ data: { error: 'Not allowed in this stage' } });
    }

    if (videoName) video.videoName = videoName;
    if (videoDuration && !isNaN(videoDuration)) video.videoDuration = videoDuration;
    else return res.status(400).json({ data: { error: 'Enter only number in duration in seconds' } });

    await video.save();
    return res.status(200).json({ data: { message: 'Success', video: video } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

const updateDescFromStage = async (stage, task, video) => {
  if (stage === 0) {
    task.description = `${video.videoName}: Make the first call to customer`;
  } else if (stage === 1) {
    task.description = `${video.videoName}: Provide script to customer`;
  } else if (stage === 2) {
    task.description = `${video.videoName}: Provide first video to customer`;
  } else if (stage === 3) {
    task.description = `${video.videoName}: Provide video changes to customer`;
  } else if (stage === 4) {
    task.description = `${video.videoName}: Ask for full payment to customer`;
  } else if (stage === 5) {
    task.description = `${video.videoName}: Deliver final version to customer`;
  } else if (stage === 6) {
    task.description = `${video.videoName}: Make payments to video team`;
  } else if (stage === 7) {
    task.description = `${video.videoName}: Deal closed`;
  }
  await task.save();
  return;
};

const updateAssignedToFromStage = async (stage, task, video) => {
  if (stage === 0) {
    task.assigned_to = mongoose.Types.ObjectId(video.videoOperator);
  } else if (stage === 1) {
    task.assigned_to = mongoose.Types.ObjectId(video.videoOperator);
  } else if (stage === 2) {
    task.assigned_to = mongoose.Types.ObjectId(video.videoOperator);
  } else if (stage === 3) {
    task.assigned_to = mongoose.Types.ObjectId(video.videoOperator);
  } else if (stage === 4) {
    task.assigned_to = mongoose.Types.ObjectId(video.videoSales);
  } else if (stage === 5) {
    task.assigned_to = mongoose.Types.ObjectId(video.videoOperator);
  } else if (stage === 6) {
    task.assigned_to = mongoose.Types.ObjectId('5f1bc672e9cf472818dc9b6b');
  } else if (stage === 7) {
    task.assigned_to = mongoose.Types.ObjectId('5f1bc672e9cf472818dc9b6b');
  }
  await task.save();
  return;
};

router.post('/updateDealStage', auth, async (req, res) => {
  try {
    const { id, deal_stage } = req.body;
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    var video = await Video.findById(id);
    if (!video) return res.status(400).json({ data: { error: 'Cannot find video' } });

    if (chk.role != 'god' && chk.permissions.video_view == 'assigned' && String(video.assigned_to) != String(chk._id)) {
      return res.status(403).json({ data: { error: 'Not assigned to you' } });
    }

    if (chk.role !== 'god' && !chk.permissions.deal_stage_list.includes(deal_stage)) {
      return res.status(400).json({ data: { error: 'Not allowed in this stage' } });
    }

    var contact = await Contact.findOne({ customer_id: video.customer_id });
    if (!contact) return res.status(400).json({ data: { error: 'Cannot find contact' } });
    if (deal_stage < 0) return res.status(400).json({ data: { error: 'Cannot go up' } });
    var task = await Task.findById(video.task_id);

    if (!task) return res.status(400).json({ data: { error: 'No task found' } });

    if (deal_stage - 1 == 4) {
      if (!video.videoDuration)
        return res.status(400).json({
          data: { error: 'Set video duration' },
        });
      if (Number(video.videoDuration) <= 60) {
        if (contact.wallet < 1000 - ADVANCED_PAYMENT)
          return res.status(400).json({
            data: {
              error: `Insufficient funds, need ${1000 - ADVANCED_PAYMENT - contact.wallet} more`,
            },
          });
        video.deal_stage = Number(deal_stage);
        contact.wallet -= 1000 - ADVANCED_PAYMENT;
        await contact.save();
        await video.save();
        task.isWarning = false;
        task.isExpired = false;
        task.dateWarning = getTaskExpiryDate(times[video.deal_stage].s);
        task.dateExpire = getTaskExpiryDate(times[video.deal_stage].c);
        task.priority !== 'low'
          ? task.history.unshift({
              event: 'Task priority changed to low',
              time: moment().format(),
            })
          : null;
        task.priority = 'low';
        task.status = 'pending';
        await updateDescFromStage(deal_stage, task, video);
        await updateAssignedToFromStage(deal_stage, task, video);
        await task.save();
        return res.status(200).json({
          data: { message: 'Success', video: video },
        });
      } else {
        let over_shoot_length = Number(video.videoDuration) - 60;
        let total_cost = 1000 - ADVANCED_PAYMENT + over_shoot_length * 15;
        if (contact.wallet < total_cost)
          return res.status(400).json({
            data: {
              error: `Insufficient funds, Need ${total_cost - contact.wallet} more`,
            },
          });
        video.deal_stage = Number(deal_stage);
        contact.wallet -= total_cost;
        await contact.save();
        await video.save();
        task.isWarning = false;
        task.isExpired = false;
        task.dateWarning = getTaskExpiryDate(times[video.deal_stage].s);
        task.dateExpire = getTaskExpiryDate(times[video.deal_stage].c);
        task.priority !== 'low'
          ? task.history.unshift({
              event: 'Task priority changed to low',
              time: moment().format(),
            })
          : null;
        task.priority = 'low';
        task.status = 'pending';
        await updateDescFromStage(deal_stage, task, video);
        await updateAssignedToFromStage(deal_stage, task, video);
        await task.save();
        return res.status(200).json({
          data: { message: 'Success', video: video },
        });
      }
    }

    if (deal_stage === 4) {
      if (!video.videoDuration) return res.status(400).json({ data: { error: 'Set video duration' } });
      let creator = await Creator.findOne({ user_id: video.assigned_to }).populate('user_id');
      if (creator) {
        creator.paymentDue +=
          video.videoDuration <= 120 ? 400 : Math.floor((video.videoDuration - 60) / 60) * 200 + 400;
        await creator.save();
      }
    }

    if (deal_stage === 5) {
      if (contact.happyCustomer == null || contact.happyCustomer == undefined) {
        return res.status(400).json({ data: { error: 'Set customer as happy or unhappy' } });
      }
      if (contact.repeatedCustomer == null || contact.repeatedCustomer == undefined) {
        return res.status(400).json({ data: { error: 'Set customer recurrence ' } });
      }
    }

    if (deal_stage === 6) {
      task.assigned_to = mongoose.Types.ObjectId('5f1baacf261b48652929a0ea');
      await task.save();
      let tasks_chk = await Task.find({ assigned_by: 'SYSTEM_PAYALL' });
      if (tasks_chk.length <= 0) {
        createTask(
          '5f1baacf261b48652929a0ea',
          'SYSTEM_PAYALL',
          'low',
          'Make deal payment',
          'Following data needs attention',
          'none'
        );
      }
    }

    if (deal_stage === 7) {
      video.deal_stage = Number(deal_stage);
      await video.save();
      task.isWarning = false;
      task.isExpired = false;
      task.dateWarning = getTaskExpiryDate(9999);
      task.dateExpire = getTaskExpiryDate(9999);
      task.priority !== 'low'
        ? task.history.unshift({
            event: 'Task priority changed to low',
            time: moment().format(),
          })
        : null;
      task.priority = 'low';
      task.status = 'completed';
      await updateDescFromStage(deal_stage, task, video);
      await updateAssignedToFromStage(deal_stage, task, video);
      await task.save();
      return res.status(200).json({
        data: { message: 'Success', video: video },
      });
    }

    video.deal_stage = Number(deal_stage);
    await video.save();
    task.isWarning = false;
    task.isExpired = false;
    task.dateWarning = getTaskExpiryDate(times[video.deal_stage].s);
    task.dateExpire = getTaskExpiryDate(times[video.deal_stage].c);
    task.priority !== 'low'
      ? task.history.unshift({
          event: 'Task priority changed to low',
          time: moment().format(),
        })
      : null;
    task.priority = 'low';
    task.status = 'pending';
    await updateDescFromStage(deal_stage, task, video);
    await updateAssignedToFromStage(deal_stage, task, video);
    await task.save();
    return res.status(200).json({
      data: { message: 'Success', video: video },
    });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/createActivity', auth, async (req, res) => {
  try {
    const { video_id, type, status, time, description, completeComment } = req.body;
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });
    var video = await Video.findById(video_id);
    if (!video) return res.status(400).json({ data: { error: 'Cannot find video' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'assigned' && String(video.assigned_to) != String(chk._id)) {
      return res.status(403).json({ data: { error: 'Not assigned to you' } });
    }

    var task = await Task.findById(video.task_id);
    if (!task) return res.status(400).json({ data: { error: 'No task found' } });
    task.isWarning = false;
    task.isExpired = false;
    task.dateWarning = getTaskExpiryDate(times[video.deal_stage].s);
    task.dateExpire = moment(time, 'YYYY-MM-DDThh:mm').format();
    task.priority !== 'low'
      ? task.history.unshift({
          event: 'Task priority changed to low',
          time: moment().format(),
        })
      : null;
    task.priority = 'low';
    task.status = 'pending';
    await task.save();

    var userTime = moment(time, 'YYYY-MM-DDThh:mm');
    if (userTime.isBefore(moment())) video.pastActivityTime = userTime.format();
    else if (userTime.isAfter(moment())) video.nextActivityTime = userTime.format();
    await video.save();

    activity = new Activity({
      video_id: mongoose.Types.ObjectId(video_id),
      assigned_to: mongoose.Types.ObjectId(req.user.id),
      type,
      status,
      time: userTime.format(),
      description,
      completeComment,
    });
    await activity.save();
    return res.status(200).json({
      data: { message: 'Success', activity: activity },
    });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/editActivity', auth, async (req, res) => {
  try {
    const { activity_id, type, status, description, completeComment } = req.body;
    var activity = await Activity.findById(activity_id);
    if (!activity) return res.status(400).json({ data: { error: 'Cannot find activity' } });
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });
    var video = await Video.findById(activity.video_id);
    if (!video) return res.status(400).json({ data: { error: 'Cannot find video' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'assigned' && String(video.assigned_to) != String(chk._id)) {
      return res.status(403).json({ data: { error: 'Not assigned to you' } });
    }
    activity.type = type;
    activity.status = status;
    activity.description = description;
    activity.completeComment = completeComment;
    await activity.save();
    return res.status(200).json({
      data: { message: 'Success', activity: activity },
    });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getActivity/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    const activity = await Activity.findById(id);
    if (!activity) return res.status(400).json({ data: { error: 'Cannot find activity' } });
    res.status(200).json({ data: { message: 'Success', activity: activity } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getActivities/:video_id', auth, async (req, res) => {
  try {
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    const activities = await Activity.find({ video_id: req.params.video_id });
    if (!activities) return res.status(400).json({ data: { error: 'Cannot find activities' } });

    var video = await Video.findById(req.params.video_id);
    if (video.nextActivityTime && video.nextActivityTime !== '') {
      const vidNextTime = moment(video.nextActivityTime, 'YYYY-MM-DDThh:mm');
      if (vidNextTime.isBefore(moment())) {
        video.pastActivityTime = vidNextTime.format();
        const activity = activities.find((activity) => moment(activity.time, 'YYYY-MM-DDThh:mm').isAfter(moment()));
        video.nextActivityTime = activity ? activity.time : '';
      }
    }
    await video.save();
    res.status(200).json({ data: { message: 'Success', activities: activities } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.delete('/deleteActivity/:id', auth, async (req, res) => {
  try {
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    const act = await Activity.findById(req.params.id);
    const actTime = moment(act.time, 'YYYY-MM-DDThh:mm');
    if (actTime.isAfter(moment())) var timing = 'future';

    var video = await Video.findById(act.video_id);
    var activities = await Activity.find({ video_id: act.video_id });

    if (timing === 'future') {
      var activity = activities.find(
        (activity) =>
          String(activity._id) !== String(act._id) && moment(activity.time, 'YYYY-MM-DDThh:mm').isAfter(moment())
      );
      video.nextActivityTime = activity ? activity.time : '';
    } else {
      var activity = activities.find(
        (activity) =>
          String(activity._id) !== String(act._id) && moment(activity.time, 'YYYY-MM-DDThh:mm').isBefore(moment())
      );
      video.pastActivityTime = activity ? activity.time : '';
    }
    var task = await Task.findById(video.task_id);
    if (!task) return res.status(400).json({ data: { error: 'No task found' } });
    task.isWarning = false;
    task.isExpired = false;
    task.dateWarning = getTaskExpiryDate(times[video.deal_stage].s);
    task.dateExpire = getTaskExpiryDate(times[video.deal_stage].c);
    task.priority !== 'low'
      ? task.history.unshift({
          event: 'Task priority changed to low',
          time: moment().format(),
        })
      : null;
    task.priority = 'low';
    task.status = 'pending';
    await task.save();
    await video.save();
    await Activity.findByIdAndDelete(req.params.id);
    return res.status(200).json({ data: { message: 'Deleted activity' } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/checkVideoTime', auth, async (req, res) => {
  try {
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });
    var videos = await Video.find({}).lean();
    if (chk.permissions.video_view === 'assigned') {
      videos = videos.filter((vid) => String(vid.customer_id) === String(req.user.id));
    }
    var check = false;
    for (let i = 0; i < videos.length; i++) {
      if (videos[i].pastActivityTime || videos[i].nextActivityTime) {
        var videoPast = moment(videos[i].pastActivityTime);
        var videoNext = moment(videos[i].nextActivityTime);
        var past = moment().subtract(3, 'd');
        var future = moment().add(1, 'd');
        var current = moment();
        if (!videoPast.isBetween(past, current) || !videoNext.isBetween(current, future)) {
          check = true;
          videos[i]['idle'] = true;
        }
      }
    }
    return check === false
      ? res.json({ data: { message: 'Normal', videos: videos } })
      : res.json({ data: { message: 'Idle Videos', videos: videos } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/createCreator', auth, async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      creator_handle,
      languages_array,
      phone,
      email,
      gpay,
      phonepe,
      paytm,
      payment_phone,
      upi_id,
      script,
      paymentDue,
    } = req.body;

    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    var langs = languages_array;

    for (let i = 0; i < langs.length; i++) {
      var temp = langs[i];
      langs[i] = { name: temp, rating: 0 };
    }

    if (email) {
      var user = await User.findOne({ email });
      if (user) return res.status(400).json({ data: { error: 'User already exists' } });
    }
    user = new User({
      firstName,
      middleName,
      lastName,
      phone,
      email,
      role: 'user',
    });
    await user.save();

    var creator = new Creator({
      user_id: user._id,
      creator_handle,
      languages: langs,
      paymentDetails: {
        gpay: gpay,
        phonepe: phonepe,
        paytm: paytm,
        payment_phone: payment_phone ? payment_phone : null,
        upi_id: upi_id ? upi_id : '',
      },
      script,
      paymentDue,
    });
    await creator.save();
    return res.status(200).json({ data: { message: 'Success', user: user, creator: creator } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getCreator/:user_id', auth, async (req, res) => {
  try {
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    const creator = await Creator.findOne({
      user_id: req.params.user_id,
    }).populate('user_id');
    if (!creator) return res.status(400).json({ data: { error: 'Cannot find creator' } });
    return res.status(200).json({ data: { message: 'Success', creator: creator } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getCreators', auth, async (req, res) => {
  try {
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    const creators = await Creator.find({}).populate('user_id');
    return res.status(200).json({ data: { message: 'Success', creators: creators } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/editCreator', auth, async (req, res) => {
  try {
    const {
      user_id,
      firstName,
      middleName,
      lastName,
      email,
      phone,
      languages,
      gpay,
      phonepe,
      payment_phone,
      upi_id,
      paytm,
      script,
      paymentDue,
    } = req.body;

    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    var user = await User.findById(user_id);
    if (!user) return res.status(400).json({ data: { error: 'Cannot find creator' } });
    if (firstName) user.firstName = firstName;
    if (middleName) user.middleName = middleName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    var creator = await Creator.findOne({ user_id });
    if (languages) creator.languages = languages;
    if (gpay) creator.paymentDetails.gpay = gpay;
    if (phonepe) creator.paymentDetails.phonepe = phonepe;
    if (paytm) creator.paymentDetails.paytm = paytm;
    if (payment_phone) creator.paymentDetails.payment_phone = payment_phone;
    if (upi_id) creator.paymentDetails.upi_id = upi_id;
    if (script) creator.script = script;
    if (paymentDue != null && paymentDue != undefined) creator.paymentDue = paymentDue;
    await user.save();
    await creator.save();
    return res.status(200).json({ data: { message: 'Success', user: user, creator: creator } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/updatePaymentDue', auth, async (req, res) => {
  try {
    const { user_id, paymentDue } = req.body;

    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    var creator = await Creator.findOne({ user_id });
    if (paymentDue) creator.paymentDue -= paymentDue;
    await creator.save();
    return res.status(200).json({ data: { message: 'Success', creator: creator } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.delete('/deleteCreator/:user_id', auth, async (req, res) => {
  try {
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    await Creator.findOneAndDelete({ user_id: req.params.user_id });
    await User.findByIdAndDelete(req.params.user_id);
    return res.status(200).json({ data: { message: 'Deleted' } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/setCreatorAvailability', auth, async (req, res) => {
  try {
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    const { user_id, morning, evening } = req.body;
    var creator = await Creator.findOne({ user_id });
    // if (creator.current_deals.length > 0)
    //   return res.status(400).json({ data: { error: 'Task already assigned' } });
    // creator.availability.morning = morning;
    // creator.availability.evening = evening;
    if (morning == true && evening == true) creator.totalTime = 8;
    else if (morning == true || evening == true) creator.totalTime = 4;
    else creator.totalTime = 0;
    await creator.save();
    res.status(200).json({ data: { message: 'Success', creator: creator } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/clearAssigned/:id', auth, async (req, res) => {
  try {
    var video = await Video.findById(req.params.id);
    if (video.assigned_to) {
      var creator = await Creator.findOne({ user_id: video.assigned_to });
      creator.current_deals = creator.current_deals.filter((d) => String(d) !== String(video._id));
      video.assigned_to = null;
      await creator.save();
      await video.save();
    }
    return res.status(200).json({ data: { message: 'Success' } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/assignVideosToCreator', auth, async (req, res) => {
  try {
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role != 'god' && chk.permissions.video_view == 'none')
      return res.status(403).json({ data: { error: 'Not permitted' } });

    const { user_id } = req.body;
    var creator = await Creator.findOne({ user_id });

    if (chk.video_view === 'assigned') {
      var videos = await Video.find({ assigned_to: req.user.id });
    } else {
      var videos = await Video.find({});
    }

    if (creator.totalTime < times[0].s) return res.status(400).json({ data: { error: 'No time' } });

    creator.current_deals = [];

    for (let i = 0; i < videos.length; i++) {
      let timeRequired = times[videos[i].deal_stage].s;
      if (timeRequired <= creator.totalTime) {
        if (!videos[i].assigned_to) {
          if (creator.current_deals.filter((d) => String(d) === String(videos[i]._id)).length === 0) {
            creator.totalTime -= timeRequired;
            creator.current_deals.unshift(mongoose.Types.ObjectId(videos[i]._id));
            videos[i].assigned_to = mongoose.Types.ObjectId(creator.user_id);
          }
        }
      }
    }
    //if (creator.totalTime > times[0].s) creator.availability.evening = true;

    async.each(videos, async (video) => {
      await video.save();
    });

    await creator.save();

    return res.status(200).json({ data: { message: 'Success', videos: creator.current_deals } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/changeCreator', auth, async (req, res) => {
  try {
    const { video_id, creator_user_id } = req.body;
    var video = await Video.findById(video_id);
    var timeRequired = times[video.deal_stage].s;
    var prevCreator = await Creator.findOne({ user_id: video.assigned_to });
    if (prevCreator) {
      prevCreator.current_deals = prevCreator.current_deals.filter((d) => String(d) !== String(video_id));
      prevCreator.totalTime += timeRequired;
      await prevCreator.save();
    }
    var creator = await Creator.findOne({ user_id: creator_user_id });
    if (!creator) return res.status(400).json({ data: { error: 'Creator not found' } });
    if (creator.totalTime < timeRequired) return res.status(400).json({ data: { error: 'Creator has no time' } });
    video.assigned_to = mongoose.Types.ObjectId(creator_user_id);
    creator.totalTime -= timeRequired;
    creator.current_deals.unshift(mongoose.Types.ObjectId(video_id));
    await video.save();

    await creator.save();
    return res.status(200).json({ data: { message: 'Success', video: video } });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/findPossibleCreatorsinVideo/:id', auth, async (req, res) => {
  try {
    var video = await Video.findById(req.params.id);
    var creators = await Creator.find({}).populate('user_id');
    var filtered_creators = [];
    for (let i = 0; i < creators.length; i++) {
      if (
        creators[i].totalTime >= times[video.deal_stage].s &&
        String(creators[i].user_id._id) !== String(video.assigned_to)
      ) {
        for (let j = 0; j < creators[i].languages.length; j++) {
          if (creators[i].languages[j].name === video.language) {
            filtered_creators.unshift(creators[i]);
            break;
          }
        }
      }
    }
    return res.status(200).json({ data: { message: 'Success', creators: filtered_creators } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.delete('/deleteUserAccount/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const chk = await User.findById(req.user.id);
    if (chk.role != 'god' && chk.permissions.addUser != true) {
      return res.status(400).json({ data: { error: 'No permission' } });
    }
    await User.findByIdAndDelete(id);
    const creator = await Creator.findOne({ user_id: id });
    if (creator) {
      await Creator.deleteOne({ user_id: id });
    }
    return res.status(200).json({ data: { message: 'Deleted' } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getUsers', auth, async (req, res) => {
  try {
    const users = await User.find({ $or: [{ role: 'user' }, { role: 'god' }] });
    return res.status(200).json({ data: { message: 'Success', users: users } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

function uploadToS3(files, videoName, language, category, res) {
  const s3bucket = new aws.S3({
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    Bucket: config.BUCKET_NAME,
  });
  urls = [];
  async.each(files, (file) => {
    s3bucket.createBucket(function () {
      var params = {
        Bucket: config.BUCKET_NAME,
        Key: `sample_videos/${Date.now()}_${videoName}_${file.name}`,
        Body: file.data,
        ACL: 'public-read',
      };
      s3bucket.upload(params, async function (err, data) {
        if (err) {
          console.log('AWS S3 error in callback');
          console.log(err.message);
        }
        try {
          console.log('sample video upload success');
          console.log(data);
          urls.push(data.Location);
          if (urls.length === 2) {
            var sample = new SampleVideo({
              videoName,
              language,
              category,
              url: urls[0][urls[0].length - 1] == '4' ? urls[0] : urls[1],
              thumbnail: urls[0][urls[0].length - 1] == '4' ? urls[1] : urls[0],
            });
            await sample.save();
            res.status(200).json({ data: { message: 'Success', sample: sample } });
          }
        } catch (err) {
          console.log(err.message);
        }
      });
    });
  });
}

router.post('/uploadVideo', async (req, res) => {
  const { videoName, language, category } = req.files;
  var busboy = new Busboy({ headers: req.headers });
  busboy.on('finish', () => {
    console.log('finished');
    var files = [];
    files.push(req.files.video);
    files.push(req.files.thumbnail);
    console.log(files);
    uploadToS3(files, String(videoName.data), String(language.data), String(category.data), res);
  });
  req.pipe(busboy);
});

router.post('/getSampleVideos', async (req, res) => {
  try {
    const { language, category } = req.body;
    var videos = [];
    if (!category && !language) return res.status(400).json({ data: { error: 'No data sent' } });
    if (!category) {
      videos = await SampleVideo.find({ language });
    } else if (!language) {
      videos = await SampleVideo.find({ category });
    } else videos = await SampleVideo.find({ category, language });
    return res.status(200).json({ data: { message: 'Success', videos: videos } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/getSamples', async (req, res) => {
  try {
    const filter = req.body.filter.toLowerCase();
    var videos = await SampleVideo.find({});
    videos = videos.filter((v) =>
      !filter
        ? true
        : v.videoName.toLowerCase().indexOf(filter) > -1 ||
          v.category.toLowerCase().indexOf(filter) > -1 ||
          v.language.toLowerCase().indexOf(filter) > -1
    );
    return res.status(200).json({ data: { message: 'Success', videos: videos } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getAllSamples', async (req, res) => {
  try {
    const videos = await SampleVideo.find({});
    return res.status(200).json({ data: { message: 'Success', videos: videos } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

cron.schedule('0 40 13 * * *', async () => {
  console.log('timee');
  var videos = await Video.find({}).lean();
  if (!videos) return res.status(400).json({ data: { error: 'Cannot find videos' } });
  await recalculateVideoStates(videos);
  let tasks = await Task.find({ assigned_by: 'system', isExpired: true }).populate('assigned_to').populate('video_id');
  tasks = tasks.sort(function (a, b) {
    if (!a || !b || !a.assigned_to || !b.assigned_to) return 0;
    if (a.assigned_to.firstName < b.assigned_to.firstName) {
      return -1;
    }
    if (a.assigned_to.firstName > b.assigned_to.firstName) {
      return 1;
    }
    return 0;
  });
  let htmlList = `<table><tr><th>Task Owner</th><th>Video Name</th><th>Task Description</th><th>Expiry Time</th></tr>${tasks.map(
    (t) =>
      `<tr><td>${
        t.assigned_to ? t.assigned_to.firstName + t.assigned_to.middleName + t.assigned_to.lastName : ''
      }</td><td>${t.video_id ? t.video_id.videoName : ''}</td><td>${t.description}</td><td>${t.dateExpire}</td></tr>`
  )}</table>`;
  let users = await User.find({ $or: [{ role: 'god' }, { subRole: { $in: ['sales', 'operator'] } }] });
  let userEmails = users.map((u) => u.email);
  const msg = {
    to: userEmails,
    from: 'kalpkriti@gmail.com',
    subject: 'Video Report',
    text: `Videos currently with exceeded Customer time: ${RED_COUNT}`,
    html: htmlList,
  };
  sgMail.send(msg).then(console.log('Video reports sent by mail'));
});

cron.schedule('0 30 18 * * *', async () => {
  var creators = await Creator.find({});
  async.each(creators, async (creator) => {
    creator.totalTime = 0;
    await creator.save();
  });
});

router.post('/addLanguage', async (req, res) => {
  try {
    const languageName = req.body.language;
    var language = new Language({ languageName });
    await language.save();
    return res.status(200).json({ data: { message: 'Success', language: language } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getLanguages', async (req, res) => {
  try {
    const languages = await Language.find({});
    return res.status(200).json({
      data: {
        message: 'Success',
        length: languages.length,
        languages: languages,
      },
    });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/findPossibleCreators/:lang', auth, async (req, res) => {
  try {
    const language = req.params.lang;
    var creators = await Creator.find({}).populate('user_id');
    var filtered_creators = [];
    for (let i = 0; i < creators.length; i++) {
      if (creators[i].totalTime >= times[0].s) {
        for (let j = 0; j < creators[i].languages.length; j++) {
          if (creators[i].languages[j].name === language) {
            filtered_creators.unshift(creators[i]);
            break;
          }
        }
      }
    }
    return res.status(200).json({ data: { message: 'Success', creators: filtered_creators } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/createTask', auth, async (req, res) => {
  try {
    const { assigned_to, priority, description, time, details, recurrence } = req.body;
    var task = new Task({
      assigned_by: req.user.id,
      assigned_to: mongoose.Types.ObjectId(assigned_to),
      priority,
      description,
      details,
      dateExpire: time ? moment(time, 'YYYY-MM-DDThh:mm').format() : null,
      status: 'pending',
      recurrence,
      dateCreated: moment().format(),
    });
    await task.save();
    return res.status(200).json({ data: { message: 'Success', task: task } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/getTasks', auth, async (req, res) => {
  try {
    const { task_owner, task_status, user_id } = req.body;
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role === 'god') {
      var tasks = await Task.find({}).populate('assigned_to').populate('video_id');
    } else {
      var tasks = await Task.find({ assigned_to: chk._id }).populate('assigned_to').populate('video_id');
    }
    var sortedTasks = tasks.sort(
      (a, b) => new moment(a.dateExpire, 'YYYY-MM-DDThh:mm') - new moment(b.dateExpire, 'YYYY-MM-DDThh:mm')
    );
    sortedTasks = sortedTasks.filter(
      (t) =>
        (!task_owner || !t.assigned_by ? true : String(task_owner) === String(t.assigned_by)) &&
        (!task_status ? true : t.status === task_status) &&
        (!user_id || !t.assigned_to ? true : String(user_id) === String(t.assigned_to._id))
    );
    return res.status(200).json({ data: { message: 'Success', tasks: sortedTasks } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getAllTasks', auth, async (req, res) => {
  try {
    const chk = await User.findById(req.user.id);
    if (!chk) return res.status(401).json({ data: { error: 'No account found' } });
    if (chk.role === 'god') {
      var tasks = await Task.find({}).populate('assigned_to').populate('video_id');
    } else {
      var tasks = await Task.find({ assigned_to: chk._id }).populate('assigned_to').populate('video_id');
    }
    var sortedTasks = tasks.sort(
      (a, b) => new moment(a.dateExpire, 'YYYY-MM-DDThh:mm') - new moment(b.dateExpire, 'YYYY-MM-DDThh:mm')
    );
    return res.status(200).json({ data: { message: 'Success', tasks: sortedTasks } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getTask/:task_id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.task_id).populate('assigned_to');
    return res.status(200).json({ data: { message: 'Success', task: task } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.post('/editTask/:id', auth, async (req, res) => {
  try {
    const { priority, description, details, recurrence } = req.body;
    var task = await Task.findById(req.params.id);
    task.priority !== priority
      ? task.history.unshift({
          event: `Task priority changed to ${priority}`,
          time: moment().format(),
        })
      : null;
    if (priority) task.priority = priority;
    if (description) task.description = description;
    if (details) task.details = details;
    if (recurrence) task.recurrence = recurrence;
    await task.save();
    return res.status(200).json({ data: { message: 'Success', task: task } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.delete('/deleteTask/:id', auth, async (req, res) => {
  try {
    var video = await Video.findOne({ task_id: req.params.id });
    if (video) {
      video.task_id = null;
      await video.save();
    }
    await Task.findByIdAndDelete(req.params.id);
    return res.status(200).json({ data: { message: 'Success' } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/setTaskComplete/:id', auth, async (req, res) => {
  try {
    var task = await Task.findById(req.params.id);
    task.status = 'completed';
    task.history.unshift({ event: 'Task Completed', time: moment().format() });
    await task.save();
    return res.status(200).json({ data: { message: 'Success' } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getOperators', auth, async (req, res) => {
  try {
    const operators = await User.find({ subRole: 'operator' });
    if (!operators) return res.status(400).json({ data: { error: 'No operators found' } });
    return res.status(200).json({ data: { message: 'Success', users: operators } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/touched/:id', auth, async (req, res) => {
  try {
    var customer = await Contact.findOne({ customer_id: req.params.id });
    customer.touched.unshift({ date: moment().format(), user: customer.customer_id });
    await customer.save();
    return res.status(200).json({ data: { message: 'Success', customer: customer } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

router.get('/getTouches/:id', auth, async (req, res) => {
  try {
    var customer = await Contact.findOne({ customer_id: req.params.id });
    return res.status(200).json({ data: { message: 'Success', touches: customer.touched } });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ data: { error: 'Server Error' } });
  }
});

module.exports = router;
