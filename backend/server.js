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

// MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/identifyme')
    .then(() => console.log("Connected to MongoDB (identifyme)..."))
    .catch(err => console.error("MongoDB connection error:", err));

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Helper: Calculate age
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
    } catch (e) { return 0; }
}

app.post('/verify', upload.fields([{ name: 'idImage' }, { name: 'selfieImage' }]), async (req, res) => {
    console.log("--- Processing Verification ---");
    try {
        if (!req.files || !req.files['idImage'] || !req.files['selfieImage']) {
            return res.status(400).json({ success: false, message: 'Images are missing.' });
        }

        const idImage = req.files['idImage'][0];
        const selfieImage = req.files['selfieImage'][0];

        // 1. OBRADA SLIKE (Povećavamo kontrast i pretvaramo u crno-bijelo)
        // Ovo pomaže da se tačke u datumu bolje vide (DD.MM.YYYY)
        const preprocessedIdBuffer = await sharp(idImage.buffer)
            .resize(2000) // Veoma velika rezolucija za sitne brojeve
            .grayscale()
            .normalize()
            .sharpen({ sigma: 1.5 })
            .threshold(150) // Pretvara u čistu crno-bijelu sliku (uklanja pozadinu/hologram)
            .toBuffer();

        // 2. OCR (Tesseract)
        const { data: { text } } = await Tesseract.recognize(preprocessedIdBuffer, 'eng');
        
        // Čišćenje OCR grešaka (O->0, I->1, S->5)
        let cleanedText = text
            .replace(/[ODo]/g, '0')
            .replace(/[lI]/g, '1')
            .replace(/[S]/g, '5')
            .replace(/[,]/g, '.'); 

        console.log("OCR Scanned Text:", cleanedText);

        // 3. Pronalaženje Datuma Rođenja (DOB Logic)
        // Tražimo sve datume u formatu XX.XX.XXXX
        const dateRegex = /(\d{2})[\.\s\-\/]+(\d{2})[\.\s\-\/]+(\d{4})/g;
        const matches = [...cleanedText.matchAll(dateRegex)];

        let dobRaw = null;

        if (matches.length > 0) {
            // Pravimo listu svih pronađenih datuma
            const foundDates = matches.map(m => {
                return {
                    original: m[0],
                    clean: `${m[1]}/${m[2]}/${m[3]}`, // Formatiramo kao DD/MM/YYYY
                    year: parseInt(m[3], 10) // Izvučemo godinu
                };
            });

            console.log("Found dates:", foundDates);

            // LOGIKA: Sortiramo po godini (od najmanje ka najvećoj)
            // Datum rođenja je UVIJEK najmanja godina (npr. 1995 < 2031)
            // Ovim eliminišemo "Valid Until" datum.
            foundDates.sort((a, b) => a.year - b.year);

            // Uzimamo prvi datum iz sortirane liste (najstariji)
            dobRaw = foundDates[0].clean;
            console.log("Selected DOB (Oldest Date):", dobRaw);
        }

        if (!dobRaw) {
            return res.json({ success: false, message: 'Date of Birth not detected. Please capture a closer image without glare.' });
        }

        const age = calculateAge(dobRaw);

        // 4. Biometrija (Face++)
        const form = new FormData();
        form.append('api_key', process.env.FACEPP_API_KEY);
        form.append('api_secret', process.env.FACEPP_API_SECRET);
        form.append('image_file1', idImage.buffer, { filename: 'id.jpg' });
        form.append('image_file2', selfieImage.buffer, { filename: 'selfie.jpg' });

        const faceResponse = await axios.post('https://api-us.faceplusplus.com/facepp/v3/compare', form, { headers: form.getHeaders() });
        const confidence = faceResponse.data.confidence || 0;
        const faceMatch = confidence >= 70;

        let resultText = "";
        if (age < 18) {
            resultText = `Access Denied: You are under 18 (${age}). ❌`;
        } else if (!faceMatch) {
            resultText = `18+ (${age}) but not the same person. ⚠️`;
        } else {
            resultText = `Verification Successful! Age: ${age}. ✅`;
        }

        // 5. Spašavanje u Bazu
        try {
            const newRecord = new Verification({
    dob: dobRaw,             
    age: age,                
    faceConfidence: confidence,
    result: resultText       
});

await newRecord.save();      
console.log("Saved to database!");
        } catch (dbErr) {
            console.error("DB Save Error:", dbErr.message);
        }

        res.json({ success: true, result: resultText, age, confidence });

    } catch (error) {
        console.error("Server Error:", error.message);
        res.status(500).json({ success: false, message: "Server error occurred." });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));