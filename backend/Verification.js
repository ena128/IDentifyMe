const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
    dob: String,
    age: Number,
    faceConfidence: Number,
    result: String,
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Verification', verificationSchema);