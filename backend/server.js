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

// MongoDB URI
const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/identifyme';

app.use(cors({
    origin: 'https://identifyme-app-fnhxi.ondigitalocean.app', 
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

mongoose.connect(mongoURI)
    .then(() => console.log("Connected to MongoDB ✅"))
    .catch(err => console.error("MongoDB connection error ❌:", err));

const upload = multer({ storage: multer.memoryStorage() });

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
    } catch (e) { return 0; }
}

app.post('/verify', upload.fields([{ name: 'idImage' }, { name: 'selfieImage' }]), async (req, res) => {
    let dobRaw = "Not detected";
    let age = 0;
    let confidence = 0;
    let resultText = "";

    try {
        if (!req.files || !req.files['idImage'] || !req.files['selfieImage']) {
            return res.status(400).json({ success: false, result: "Images are missing." });
        }

        const idImage = req.files['idImage'][0];
        const selfieImage = req.files['selfieImage'][0];

        // 1. OCR Procesiranje
        const preprocessedIdBuffer = await sharp(idImage.buffer).resize(1200).grayscale().normalize().toBuffer();
        const { data: { text } } = await Tesseract.recognize(preprocessedIdBuffer, 'eng');
        let cleanedText = text.replace(/[ODo]/g, '0').replace(/[lI]/g, '1').replace(/[S]/g, '5').replace(/[,]/g, '.');

        // 2. Provjera Dokumenta
        const idKeywords = ["identity", "card", "hercegovina", "republic", "birth", "prezime", "ime", "datum", "bosna"];
        const hasIdKeywords = idKeywords.some(keyword => cleanedText.toLowerCase().includes(keyword));

        if (!hasIdKeywords) {
            resultText = "No ID found ❌: Identity card not detected. Please upload a clearer photo.";
            await new Verification({ result: resultText }).save();
            return res.json({ success: false, result: resultText });
        }

        // 3. Traženje Datuma
        const dateRegex = /(\d{2})[\.\s\-\/]+(\d{2})[\.\s\-\/]+(\d{4})/g;
        const matches = [...cleanedText.matchAll(dateRegex)];
        if (matches.length > 0) {
            const foundDates = matches.map(m => ({ clean: `${m[1]}/${m[2]}/${m[3]}`, year: parseInt(m[3], 10) }));
            foundDates.sort((a, b) => a.year - b.year);
            dobRaw = foundDates[0].clean;
            age = calculateAge(dobRaw);
        } else {
            resultText = "Failed to read Date of Birth from ID. ❌";
            await new Verification({ result: resultText }).save();
            return res.json({ success: false, result: resultText });
        }

        // 4. Face++ Biometrija
        const form = new FormData();
        form.append('api_key', process.env.FACEPP_API_KEY);
        form.append('api_secret', process.env.FACEPP_API_SECRET);
        form.append('image_file1', idImage.buffer, { filename: 'id.jpg' });
        form.append('image_file2', selfieImage.buffer, { filename: 'selfie.jpg' });

        const faceResponse = await axios.post('https://api-us.faceplusplus.com/facepp/v3/compare', form, { headers: form.getHeaders() });
        confidence = faceResponse.data.confidence || 0;

        const isSamePerson = confidence >= 70;
        const isAdult = age >= 18;

        // 5. Finalna Logika Poruka
        if (isSamePerson && isAdult) {
            resultText = "Verification Successful! Same person & 18+ ✅";
        } else if (!isSamePerson && isAdult) {
            resultText = `Verification Failed ❌: Faces don't match (Similarity: ${confidence.toFixed(1)}%)`;
        } else if (isSamePerson && !isAdult) {
            resultText = `Verification Failed ❌: Person is under 18 years old (Age: ${age})`;
        } else {
            resultText = "Verification Failed ❌: Not the same person and under 18";
        }

        // Spašavanje u bazu
        await new Verification({ dob: dobRaw, age, faceConfidence: confidence, result: resultText }).save();

        // SLANJE ODGOVORA - success je true SAMO ako je punoljetan i ista osoba
        res.json({ success: isSamePerson && isAdult, result: resultText, age, confidence });

    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ success: false, result: "Server error occurred." });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));