import React, { useState, useRef } from 'react';
import './App.css';
import Webcam from 'react-webcam';

const App = () => {
  const [idUpload, setIdUpload] = useState(null);
  const [idFile, setIdFile] = useState(null);
  const [selfieUpload, setSelfieUpload] = useState(null);
  const [showSelfieButton, setShowSelfieButton] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState('');

  const webcamRef = useRef(null);

  const handleIdChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setIdFile(file);
      setIdUpload(URL.createObjectURL(file));
      setShowSelfieButton(true);
      setVerificationResult('');
    }
  };

  const captureSelfie = () => {
    const imageSrc = webcamRef.current.getScreenshot();
    setSelfieUpload(imageSrc);
    setShowWebcam(false);
  };

  const verifyUser = async () => {
    if (!idFile || !selfieUpload) return;
    setLoading(true);
    setVerificationResult('');

    try {
      const formData = new FormData();
      formData.append('idImage', idFile);
      const selfieBlob = await fetch(selfieUpload).then(res => res.blob());
      formData.append('selfieImage', selfieBlob, 'selfie.jpg');

      const res = await fetch('http://localhost:5000/verify', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      setVerificationResult(data.result || data.message);
    } catch (err) {
      setVerificationResult('Verification failed ❌');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header"><h1>IDentifyMe+</h1></header>
      <section className="hero">
        <label className="fileUploaderContainer">
          <span>Upload your ID</span>
          <input type="file" onChange={handleIdChange} accept="image/*" />
        </label>

        {idUpload && <div className="preview"><img src={idUpload} alt="ID" width="200" /></div>}

        {showSelfieButton && !selfieUpload && !showWebcam && (
          <button onClick={() => setShowWebcam(true)}>Take a Selfie</button>
        )}

        {showWebcam && (
          <div className="webcam-container">
            <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" width={350} />
            <button onClick={captureSelfie}>Capture</button>
          </div>
        )}

        {selfieUpload && <div className="preview"><img src={selfieUpload} alt="Selfie" width="200" /></div>}

        <button className="generate-btn" onClick={verifyUser} disabled={loading || !idFile || !selfieUpload}>
          {loading ? 'Processing...' : 'Verify Me'}
        </button>

        {/* LOADING SPINNER */}
        {loading && <div className="spinner"></div>}

        {/* RESULT DISPLAY */}
        {!loading && verificationResult && (
          <div className={`result-container ${
            verificationResult.includes('✅') ? 'success-bg' : 
            verificationResult.includes('⚠️') ? 'warning-bg' : 'error-bg'
          }`}>
            <span className="result-icon">
              {verificationResult.includes('✅') ? '✔️' : verificationResult.includes('⚠️') ? '⚠️' : '❌'}
            </span>
            <p>{verificationResult}</p>
          </div>
        )}
      </section>
    </div>
  );
};

export default App;