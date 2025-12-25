require('dotenv').config();
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const vision = require('@google-cloud/vision');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 5000;

// Multer (store files in memory)
const upload = multer({ storage: multer.memoryStorage() });

// Google Vision client
const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

// Helper: calculate age from dd/mm/yyyy
function calculateAge(dobString) {
  const [day, month, year] = dobString.split('/').map(Number);
  const dob = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// ===== VERIFY ENDPOINT =====
app.post(
  '/verify',
  upload.fields([
    { name: 'idImage', maxCount: 1 },
    { name: 'selfieImage', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const idImage = req.files['idImage'][0];
      const selfieImage = req.files['selfieImage'][0];

      // =========================
      // 1️⃣ PREPROCESS ID IMAGE
      // =========================
      const preprocessedIdImage = await sharp(idImage.buffer)
        .grayscale()           // remove color noise
        .normalize()           // improve contrast
        .sharpen()             // sharpen text
        .toBuffer();

      // =========================
      // 2️⃣ OCR WITH GOOGLE VISION
      // =========================
      const [result] = await client.textDetection(preprocessedIdImage);
      const textAnnotations = result.textAnnotations;

      if (!textAnnotations || textAnnotations.length === 0) {
        return res.json({
          success: false,
          message: 'No text detected on ID'
        });
      }

      const ocrText = textAnnotations[0].description;
      console.log('OCR TEXT:', ocrText);

      // =========================
      // 3️⃣ EXTRACT DOB
      // =========================
      const dobMatch = ocrText.match(/\b(\d{2}[\/.\-]\d{2}[\/.\-]\d{4})\b/);

      if (!dobMatch) {
        return res.json({
          success: false,
          message: 'DOB not found in ID'
        });
      }

      const dob = dobMatch[1].replace('.', '/').replace('-', '/');
      const age = calculateAge(dob);

      // =========================
      // 4️⃣ FACE++ COMPARISON
      // =========================
      const form = new FormData();
      form.append('api_key', process.env.FACEPP_API_KEY);
      form.append('api_secret', process.env.FACEPP_API_SECRET);
      form.append('image_file1', idImage.buffer, {
        filename: idImage.originalname
      });
      form.append('image_file2', selfieImage.buffer, {
        filename: selfieImage.originalname
      });

      const faceResponse = await axios.post(
        'https://api-us.faceplusplus.com/facepp/v3/compare',
        form,
        { headers: form.getHeaders() }
      );

      const confidence = faceResponse.data.confidence || 0;
      const faceMatch = confidence >= 70;

      // =========================
      // 5️⃣ FINAL DECISION
      // =========================
      let resultText = '';
      if (age < 18) resultText = 'Under 18 ❌';
      else if (age >= 18 && !faceMatch) resultText = '18+ but selfie mismatch ⚠️';
      else resultText = '18+ ✅';

      res.json({
        success: true,
        age,
        faceConfidence: confidence,
        result: resultText
      });

    } catch (error) {
      console.error(error.response?.data || error.message);
      res.status(500).json({
        success: false,
        error: 'Verification failed'
      });
    }
  }
);

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
