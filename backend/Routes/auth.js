const express = require('express');
const User = require('../modules/User');
const router = express.Router();
const { body, validationResult } = require('express-validator');
var fetchuser = require('../middleware/fetchuser')
var bcrypt = require('bcryptjs')
var jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sanchit@wa_dev_only';
//ROUTE 1 : create user using : POST "/api/auth/createUser" . no login required
router.post('/createUser', [
  body('name', "enter a valid name").isLength({ min: 5 }),    // after name we can send custom message 
  body('email', "enter a valid email").isEmail(),              // ***** these are check field ******
  body('password', "password must be 5 length").isLength({ min: 5 }),
],
  async (req, res) => {                  // has request and response ( status for the end user)
    let success = false;
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    console.log('[auth:create:start]', JSON.stringify({ reqId: req.reqId || '', email }));
    // if there are errors return bad request and the errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[auth:create:validation_failed]', JSON.stringify({
        reqId: req.reqId || '',
        email,
        firstError: errors.array()[0]?.msg || 'validation failed',
      }));
      return res.status(400).json({ success, error: errors.array()[0].msg, errors: errors.array() });
    }

    try {
      // check the user with email is present already 
      let user = await User.findOne({ email });
      if (user) {
        console.log('[auth:create:already_exists]', JSON.stringify({ reqId: req.reqId || '', email }));
        return res.status(400).json({ success, error: "sorry the user already exists" })
      }

      // as salt is added to the decrypted key we will generate it here

      const salt = await bcrypt.genSalt(10); // from documentation
      const secPass = await bcrypt.hash(req.body.password, salt);

      // await waits for the function to happen and then continues 


      // creating a new user 
      user = await User.create({  // taken from the user
        name,
        password: secPass,
        email,
      });

      const data = {
        user: {
          id: user.id
        }
      }
      const authtoken = jwt.sign(data, JWT_SECRET);
      success = true;
      console.log('[auth:create:success]', JSON.stringify({ reqId: req.reqId || '', email, userId: user.id }));
      res.json({ success, authtoken });
      // catch all the other error (coz if not cought send the custom one)
    } catch (error) {
      console.error('[auth:create:error]', JSON.stringify({ reqId: req.reqId || '', email, message: error.message }));
      res.status(500).send("some error occured");
    }
  })

//ROUTE 2 : create user using : POST "/api/auth/Login" . no login required
router.post('/login', [
  body('email', "enter a valid email").isEmail(),
  body('password', "password cannot be blank").exists(),
], async (req, res) => {

  let success = false;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('[auth:login:validation_failed]', JSON.stringify({
      reqId: req.reqId || '',
      firstError: errors.array()[0]?.msg || 'validation failed',
    }));
    return res.status(400).json({ success, error: errors.array()[0].msg, errors: errors.array() });
  }
  // at this stage the user has filled the usesr id and password 
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  console.log('[auth:login:start]', JSON.stringify({ reqId: req.reqId || '', email }));
  try {
    let user = await User.findOne({ email }); // find one email form the user database
    if (!user) {
      success = false;
      console.log('[auth:login:user_not_found]', JSON.stringify({ reqId: req.reqId || '', email }));
      return res.status(400).json({ success, error: "please enter correct credentials" }); // send status and message dont use specific info {user doesnot exists incorrect email}
    }
    // now authenticate the password 
    const comparePassword = await bcrypt.compare(password, user.password);
    if (!comparePassword) {
      success = false;
      console.log('[auth:login:password_mismatch]', JSON.stringify({ reqId: req.reqId || '', email }));
      return res.status(400).json({ success, error: "please enter correct credentials" });
    }
    const data = {
      user: {
        id: user.id
      }
    }
    const authtoken = jwt.sign(data, JWT_SECRET);
    success = true;
    console.log('[auth:login:success]', JSON.stringify({ reqId: req.reqId || '', email, userId: user.id }));
    res.json({ success, authtoken });

  } catch (error) {
    console.error('[auth:login:error]', JSON.stringify({ reqId: req.reqId || '', email, message: error.message }));
    res.status(500).send("some error occured");
  }
});

// ROUTE 3 : gives you the user details {POST "/api/auth/getUser"} of the loged in details of the user  (we will be using the Token Id )
router.post('/getUser', fetchuser, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("-password")
    res.send(user)
  } catch (error) {
    console.error(error.message);
    res.status(500).send("some error occured");
  }
})

module.exports = router
