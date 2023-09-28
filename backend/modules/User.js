const mongoose = require('mongoose');
const { Schema } = mongoose; // creating the schema 

const UserSchema = new Schema({
    name:{
        type: String,
        required: true
    } , 
    email:{
        type: String , 
        required : true,
        unique: true,
    },
    password:{
        type: String , 
        required : true,
    },
    date:{
        type: Date, 
        default : Date.now
    },
  });
  const User = mongoose.model('user' , UserSchema);
  User.createIndexes(); // for creating the index we have defined the constant 
  module.exports = User; //module name , schema 