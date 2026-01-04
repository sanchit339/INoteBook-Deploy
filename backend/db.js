const mongoose = require('mongoose');

const mongoUri = process.env.MONGO_URI || "mongodb+srv://sanchit339:%40Sanchit1008@cluster0.ipkmsxh.mongodb.net/inotebook"

const connectToMongo = () => {
    mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    }).then(() => {
        console.log("Connected to MongoDB successfully");
    }).catch((error) => {
        console.error("MongoDB connection error:", error);
    });
}

module.exports = connectToMongo;