require('dotenv').config();
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const sharp = require('sharp');
const cors = require('cors');
const Tesseract = require('tesseract.js');
const mongoose = require('mongoose');
const Verification = require('./Verification');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// 1. MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/identifyme')
    .then(() => console.log("Connected to MongoDB (identifyme)..."))
    .catch(err => console.error("MongoDB connection error:", err));

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Helper: Calculate age from DOB string
 * Supports formats: dd/mm/yyyy, dd.mm.yyyy, dd-mm-yyyy
 */
function calculateAge(dobString) {
    try {
        const parts = dobString.split(/[\/\.\-]/).map(Number);
        if (parts.length !== 3) return 0;
        
        const [day, month, year] = parts;
        const dob = new Date(year, month - 1, day);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        return age;
    } catch (e) {
        return 0;
    }
}

app.post('/verify', upload.fields([
    { name: 'idImage', maxCount: 1 },
    { name: 'selfieImage', maxCount: 1 }
]), async (req, res) => {
    console.log("Request received, starting processing...");
    
    try {
        if (!req.files || !req.files['idImage'] || !req.files['selfieImage']) {
            return res.status(400).json({ success: false, message: 'Missing images for processing.' });
        }

        const idImage = req.files['idImage'][0];
        const selfieImage = req.files['selfieImage'][0];

        // 2. Image Preprocessing (Sharp)
        const preprocessedIdBuffer = await sharp(idImage.buffer)
            .resize(1200) // Slightly larger for better OCR accuracy
            .grayscale()
            .normalize()
            .toFormat('png')
            .toBuffer();

        // 3. OCR (Tesseract.js)
        console.log("Starting Tesseract OCR...");
        const { data: { text } } = await Tesseract.recognize(preprocessedIdBuffer, 'eng');
        console.log("Extracted text from ID:", text);

        // 4. Extract Date of Birth (Bosnian ID Optimized Logic)
        // We look for all date patterns (dd.mm.yyyy or dd/mm/yyyy)
        const dateRegex = /(\d{2})[\s\/\.\-]*(\d{2})[\s\/\.\-]*(\d{4})/g;
        const allDates = text.match(dateRegex);

        let dobRaw = null;
        if (allDates && allDates.length > 0) {
            // On Bosnian IDs, DOB is typically the FIRST date mentioned after the name
            dobRaw = allDates[0].replace(/\s/g, ''); 
            console.log(`Date(s) found. Selecting the first one as DOB: ${dobRaw}`);
        }

        if (!dobRaw) {
            console.log("No Date of Birth detected in the text.");
            return res.json({ success: false, message: 'Date of Birth not detected. Please use a clearer, well-lit image.' });
        }

        // Standardize format for age calculation (dd/mm/yyyy)
        const cleanDob = dobRaw.replace(/[\.\-]/g, '/');
        const age = calculateAge(cleanDob);
        console.log(`Processed DOB: ${cleanDob}, Calculated Age: ${age}`);

        // 5. Biometrics (Face++)
        console.log("Sending images to Face++ API...");
        const form = new FormData();
        form.append('api_key', process.env.FACEPP_API_KEY);
        form.append('api_secret', process.env.FACEPP_API_SECRET);
        form.append('image_file1', idImage.buffer, { filename: 'id.jpg' });
        form.append('image_file2', selfieImage.buffer, { filename: 'selfie.jpg' });

        const faceResponse = await axios.post(
            'https://api-us.faceplusplus.com/facepp/v3/compare',
            form,
            { headers: form.getHeaders() }
        );

        const confidence = faceResponse.data.confidence || 0;
        const faceMatch = confidence >= 70; // 70% threshold for matching
        console.log(`Face++ Confidence: ${confidence}%`);

        // 6. Result Logic
        let resultText = '';
        if (age < 18) {
            resultText = `Access Denied: You are ${age} years old. ❌`;
        } else if (!faceMatch) {
            resultText = '18+ but selfie does not match the ID. ⚠️';
        } else {
            resultText = 'Verification successful! 18+ ✅';
        }

        // 7. Save to MongoDB
        const newRecord = new Verification({
            dob: cleanDob,
            age: age,
            faceConfidence: confidence,
            result: resultText
        });
        await newRecord.save();
        console.log("Record successfully saved to MongoDB.");

        // Send final response to frontend
        res.json({
            success: true,
            age,
            faceConfidence: confidence,
            result: resultText
        });

    } catch (error) {
        console.error('SERVER ERROR:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Server-side error during verification.',
            details: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`OCR Mode: Tesseract.js (Local)`);
    console.log(`Database: MongoDB (identifyme)`);
    console.log(`-----------------------------------------`);
});