import React, { useState, useRef } from 'react';
import './App.css';
import { createWorker } from 'tesseract.js';
import Webcam from 'react-webcam';

// Create Tesseract worker once
const worker = createWorker({ logger: (m) => console.log(m) });

// Dummy face verification function
// Replace this with your backend API call
const verifyFaceMatch = async (idImage, selfieImage) => {
  // Simulate face mismatch 50% of the time
  return Math.random() > 0.5;
};

const App = () => {
  const [idUpload, setIdUpload] = useState(null);
  const [selfieUpload, setSelfieUpload] = useState(null);
  const [showSelfieButton, setShowSelfieButton] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState('');

  const webcamRef = useRef(null);

  const handleIdChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setIdUpload(URL.createObjectURL(file));
      setShowSelfieButton(true);
      setVerificationResult('');
    }
  };

  const captureSelfie = () => {
    const imageSrc = webcamRef.current.getScreenshot();
    setSelfieUpload(imageSrc);
    setShowWebcam(false);
    setVerificationResult('');
  };

  const verifyUser = async () => {
  if (!idUpload || !selfieUpload) return;

  setLoading(true);
  setVerificationResult('');

  try {
    // Prepare images as Base64
    const idFile = await fetch(idUpload);
    const idBlob = await idFile.blob();
    const idBase64 = await blobToBase64(idBlob);

    const selfieFile = await fetch(selfieUpload);
    const selfieBlob = await selfieFile.blob();
    const selfieBase64 = await blobToBase64(selfieBlob);

    // Send to backend
    const res = await fetch('http://localhost:5000/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idImage: idBase64, selfieImage: selfieBase64 }),
    });

    const data = await res.json();
    setVerificationResult(data.result);

  } catch (err) {
    console.error(err);
    setVerificationResult('Verification failed ❌');
  } finally {
    setLoading(false);
  }
};

// Helper to convert blob to Base64
const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]); // remove "data:image/...;base64,"
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
  return (
    <div className="app">
      <header className="header">
        <h1>IDentifyMe+</h1>
      </header>

      <section className="hero">
        <label className="fileUploaderContainer">
          <span>Upload your ID</span>
          <input type="file" onChange={handleIdChange} accept="image/*" />
        </label>

        {idUpload && (
          <div className="preview">
            <h3>ID Preview:</h3>
            <img src={idUpload} alt="ID Upload" width="200" />
          </div>
        )}

        {showSelfieButton && !selfieUpload && !showWebcam && (
          <button onClick={() => setShowWebcam(true)}>Take a Selfie</button>
        )}

        {showWebcam && (
          <div className="webcam-container">
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              width={350}
            />
            <button onClick={captureSelfie}>Capture Selfie</button>
          </div>
        )}

        {selfieUpload && (
          <div className="preview">
            <h3>Selfie Preview:</h3>
            <img src={selfieUpload} alt="Selfie" width="200" />
          </div>
        )}

        <button
          className="generate-btn"
          onClick={verifyUser}
          disabled={loading || !idUpload || !selfieUpload}
        >
          {loading ? 'Verifying...' : 'Verify Me'}
        </button>

        {verificationResult && (
          <p className={`verification-result ${verificationResult.includes('❌') ? 'error' : verificationResult.includes('⚠️') ? 'warning' : 'success'}`}>
            {verificationResult}
          </p>
        )}
      </section>
    </div>
  );
};

export default App;
