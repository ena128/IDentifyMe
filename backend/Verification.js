
const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
    dob: { type: String, default: "Not detected" }, 
    age: { type: Number, default: 0 },
    faceConfidence: { type: Number, default: 0 },
    result: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Verification', verificationSchema);