const mongoose = require('mongoose');

const mongoUri = "mongodb+srv://sanchit339:%40Sanchit1008@cluster0.ipkmsxh.mongodb.net/"

const connectToMongo = ()=>{
    mongoose.connect(mongoUri ,  () =>{
        console.log("connected to mongo")
    })
}

module.exports = connectToMongo;