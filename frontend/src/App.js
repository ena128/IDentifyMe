import React, { useState, useRef } from 'react';
import './App.css';
import Webcam from 'react-webcam';

// URL vašeg DigitalOcean backend servisa
const API_URL = process.env.REACT_APP_API_URL || 'https://identify-me-app-2ndhu.ondigitalocean.app';

const App = () => {
  const [idFile, setIdFile] = useState(null);
  const [idPreview, setIdPreview] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [showWebcam, setShowWebcam] = useState(false);
  const [status, setStatus] = useState('idle');
  const [verificationResult, setVerificationResult] = useState({ success: false, message: '' });
  
  const webcamRef = useRef(null);

  const captureSelfie = () => {
    const imageSrc = webcamRef.current.getScreenshot();
    setSelfiePreview(imageSrc);
    setShowWebcam(false);
  };

  const verifyUser = async () => {
    if (!idFile || !selfiePreview) return;
    setStatus('loading');
    
    const formData = new FormData();
    formData.append('idImage', idFile);
    
    try {
      const selfieBlob = await fetch(selfiePreview).then(r => r.blob());
      formData.append('selfieImage', selfieBlob, 'selfie.jpg');

      const res = await fetch(`${API_URL}/verify`, { 
        method: 'POST', 
        body: formData 
      });

      const data = await res.json();
      
      // Koristimo 'success' status direktno sa servera za boju i prikaz rezultata
      setVerificationResult({ 
        success: data.success, 
        message: data.result || "Verification finished"
      });
      setStatus('result');
    } catch (e) {
      console.error("Verification error:", e);
      setVerificationResult({ 
        success: false, 
        message: "Server Error: Could not reach verification service ❌" 
      });
      setStatus('result');
    }
  };

  return (
    <div className="app-container">
      <div className="desktop-card">
        <header className="card-header">
          <h1>IDentifyMe<span className="plus">+</span></h1>
          <p>Professional Identity Verification</p>
        </header>

        <div className="main-row">
          {/* LIJEVA STRANA - DOKUMENT */}
          <div className="column">
            <div className="step-label">1. Identity Document</div>
            <div className="upload-zone">
              {!idPreview ? (
                <label className="desktop-upload-label">
                  <div className="icon">📁</div>
                  <span>Click to upload ID Card</span>
                  <input type="file" onChange={(e) => {
                    const file = e.target.files[0];
                    if(file) { 
                        setIdFile(file); 
                        setIdPreview(URL.createObjectURL(file)); 
                    }
                  }} />
                </label>
              ) : (
                <div className="image-wrapper">
                  <img src={idPreview} alt="ID" />
                  <button className="remove-btn" onClick={() => setIdPreview(null)}>✕</button>
                </div>
              )}
            </div>
          </div>

          <div className="vertical-divider"></div>

          {/* DESNA STRANA - SELFIE */}
          <div className="column">
            <div className="step-label">2. Face Verification</div>
            <div className="upload-zone">
              {!selfiePreview && !showWebcam && (
                <button className="camera-btn" onClick={() => setShowWebcam(true)} disabled={!idPreview}>
                  <div className="icon" style={{fontSize: '2.5rem'}}>📷</div>
                  <span>Take Live Selfie</span>
                </button>
              )}

              {showWebcam && (
                <div className="webcam-wrapper">
                  <Webcam ref={webcamRef} screenshotFormat="image/jpeg" className="webcam-video" />
                  <button onClick={captureSelfie} className="capture-trigger"></button>
                </div>
              )}

              {selfiePreview && (
                <div className="image-wrapper">
                  <img src={selfiePreview} alt="Selfie" />
                  <button className="remove-btn" onClick={() => setSelfiePreview(null)}>✕</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="card-footer">
          <button className="verify-main-btn" onClick={verifyUser} disabled={!idFile || !selfiePreview}>
            VERIFY MY IDENTITY
          </button>
        </footer>
      </div>

      {status !== 'idle' && (
        <div className="modal-backdrop">
          <div className="modal-content">
            {status === 'loading' && (
              <div className="loading-view">
                <div className="spinner-ring"></div>
                <h3>Processing Identity...</h3>
              </div>
            )}
            {status === 'result' && (
              <div className={`result-view ${verificationResult.success ? 'success' : 'error'}`}>
                <div className="icon-badge">{verificationResult.success ? '✓' : '!'}</div>
                <h2>{verificationResult.success ? 'Success' : 'Verification Failed'}</h2>
                <p className="res-msg">{verificationResult.message}</p>
                <button onClick={() => setStatus('idle')} className="done-btn">Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;