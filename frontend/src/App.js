import React, { useState, useRef } from 'react';
import './App.css';
import Webcam from 'react-webcam';

const App = () => {
  const [idFile, setIdFile] = useState(null);
  const [idPreview, setIdPreview] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [showWebcam, setShowWebcam] = useState(false);
  
  // Statusi: 'idle', 'loading', 'result'
  const [status, setStatus] = useState('idle');
  const [verificationResult, setVerificationResult] = useState({ success: false, message: '', age: 0 });
  
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
    const selfieBlob = await fetch(selfiePreview).then(r => r.blob());
    formData.append('selfieImage', selfieBlob, 'selfie.jpg');

    try {
      const res = await fetch('http://localhost:5000/verify', { method: 'POST', body: formData });
      const data = await res.json();
      
      setVerificationResult({
        success: data.result.includes('✅'),
        message: data.result,
        age: data.age,
        confidence: data.confidence
      });
      setStatus('result');
    } catch (e) {
      setVerificationResult({ success: false, message: "Server Error ❌", age: 0 });
      setStatus('result');
    }
  };

  const resetAll = () => {
    setIdFile(null);
    setIdPreview(null);
    setSelfiePreview(null);
    setVerificationResult({ success: false, message: '', age: 0 });
    setStatus('idle');
  };

  return (
    <div className="app-container">
      
      <div className="glass-card">
        <header className="card-header">
          <h1>IDentifyMe<span className="plus">+</span></h1>
          <p>Secure Identity Verification</p>
        </header>

        <div className="steps-container">
          
          {/* KORAK 1: LIČNA KARTA */}
          <div className="step-box">
            <div className="step-label">1. Document</div>
            
            {!idPreview ? (
              <label className="upload-btn">
                <span>📁 Upload ID Card</span>
                <input type="file" onChange={(e) => {
                  const file = e.target.files[0];
                  if(file){
                    setIdFile(file);
                    setIdPreview(URL.createObjectURL(file));
                  }
                }} />
              </label>
            ) : (
              <div className="image-wrapper">
                <img src={idPreview} alt="ID" />
                <button className="remove-btn" onClick={() => {setIdFile(null); setIdPreview(null);}}>✕</button>
              </div>
            )}
          </div>

          <div className="divider"></div>

          {/* KORAK 2: SELFIE */}
          <div className="step-box">
            <div className="step-label">2. Your Selfie</div>
            
            {!selfiePreview && !showWebcam && (
              <button 
                className="camera-btn" 
                onClick={() => setShowWebcam(true)}
                disabled={!idPreview} // Onemogućeno dok se ne ubaci lična
              >
                📷 Take Selfie
              </button>
            )}

            {showWebcam && (
              <div className="webcam-wrapper">
                <Webcam 
                  ref={webcamRef} 
                  screenshotFormat="image/jpeg" 
                  className="webcam-video"
                />
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

        {/* AKCIJA */}
        <div className="action-footer">
          <button 
            className="verify-main-btn" 
            onClick={verifyUser} 
            disabled={!idFile || !selfiePreview}
          >
            VERIFY MY IDENTITY
          </button>
        </div>
      </div>

      {/* --- MODAL (LOADING & REZULTAT) --- */}
      {status !== 'idle' && (
        <div className="modal-backdrop">
          <div className="modal-content">
            
            {status === 'loading' && (
              <div className="loading-view">
                <div className="spinner-ring"></div>
                <h3>Verifying...</h3>
                <p>Analyzing biometrics & data</p>
              </div>
            )}

            {status === 'result' && (
              <div className={`result-view ${verificationResult.success ? 'success' : 'error'}`}>
                <div className="icon-badge">
                  {verificationResult.success ? '✓' : '!'}
                </div>
                <h2>{verificationResult.success ? 'Identity Verified' : 'Verification Failed'}</h2>
                <div className="result-details">
                  <p>{verificationResult.message}</p>
                </div>
                <button onClick={resetAll} className="done-btn">Finish</button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};

export default App;