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
    // if there are errors return bad request and the errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success, errors: errors.array() });
    }

    try {
      // check the user with email is present already 
      let user = await User.findOne({ email: req.body.email });
      if (user) {
        return res.status(400).json({ success, error: "sorry the user already exists" })
      }

      // as salt is added to the decrypted key we will generate it here

      const salt = await bcrypt.genSalt(10); // from documentation
      const secPass = await bcrypt.hash(req.body.password, salt);

      // await waits for the function to happen and then continues 


      // creating a new user 
      user = await User.create({  // taken from the user
        name: req.body.name,
        password: secPass,
        email: req.body.email,
      });

      const data = {
        user: {
          id: user.id
        }
      }
      const authtoken = jwt.sign(data, JWT_SECRET);
      success = true;
      res.json({ success, authtoken });
      // catch all the other error (coz if not cought send the custom one)
    } catch (error) {
      console.error(error.message);
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
    return res.status(400).json({ errors: errors.array() });
  }
  // at this stage the user has filled the usesr id and password 
  const { email, password } = req.body; // taking email and password from the req body 
  try {
    let user = await User.findOne({ email }); // find one email form the user database
    if (!user) {
      success = false;
      return res.status(400).json({ success, error: "please enter correct credentials" }); // send status and message dont use specific info {user doesnot exists incorrect email}
    }
    // now authenticate the password 
    const comparePassword = await bcrypt.compare(password, user.password);
    if (!comparePassword) {
      success = false;
      return res.status(400).json({ success, error: "please enter correct credentials" });
    }
    const data = {
      user: {
        id: user.id
      }
    }
    const authtoken = jwt.sign(data, JWT_SECRET);
    success = true;
    res.json({ success, authtoken });

  } catch (error) {
    console.error(error.message);
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
