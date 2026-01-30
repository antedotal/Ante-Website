
import React, { useEffect, useState } from "react";

export default function Home() {
  const [code, setCode] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const codeParam = urlParams.get("code");
      setCode(codeParam);
      if (!codeParam) {
        setIsValid(false);
      } else {
        // On mobile, try to open automatically
        if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
          const deepLink = `ante://add-friend?code=${codeParam}`;
          setTimeout(() => {
            window.location.href = deepLink;
            setTimeout(() => setShowCode(true), 1500);
          }, 299);
        }
      }
    }
  }, []);

  const handleOpenApp = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (code) {
      const deepLink = `ante://add-friend?code=${code}`;
      window.location.href = deepLink;
      setTimeout(() => setShowCode(true), 1500);
    }
  };

  return (
    <div className="body-bg">
      <div className="card">
        <div className="logo">🎯</div>
        <h1>{isValid ? "You've been invited!" : "Invalid Link"}</h1>
        <p>
          {isValid
            ? "Someone wants to add you as a friend on Ante to help verify their tasks."
            : "This invitation link appears to be invalid or expired."}
        </p>

        {isValid && (
          <button id="openApp" className="btn" onClick={handleOpenApp}>
            Open in Ante App
          </button>
        )}

        {isValid && (
          <div id="codeSection" style={{ display: showCode ? "block" : "none" }}>
            <p className="fallback">
              If the app doesn't open, copy this code and paste it in the Ante app:
            </p>
            <div className="code-display" id="codeDisplay">
              {code}
            </div>
          </div>
        )}

        <div className="store-links">
          <p>Don't have the app yet?</p>
          <p style={{ color: "#667eea", fontWeight: 500 }}>
            Download Ante from the App Store or Play Store
          </p>
        </div>
      </div>
      <style jsx global>{`
        html, body, #__next {
          height: 100%;
        }
        .body-bg {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .card {
          background: white;
          border-radius: 24px;
          padding: 40px;
          max-width: 400px;
          width: 100%;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        .logo {
          font-size: 48px;
          margin-bottom: 16px;
        }
        h1 {
          color: #1a1a2e;
          font-size: 24px;
          margin-bottom: 12px;
        }
        p {
          color: #666;
          margin-bottom: 24px;
          line-height: 1.5;
        }
        .btn {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          text-decoration: none;
          padding: 16px 32px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 16px;
          transition: transform 0.2s, box-shadow 0.2s;
          cursor: pointer;
          border: none;
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
        }
        .btn:active {
          transform: translateY(0);
        }
        .store-links {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid #eee;
        }
        .store-links p {
          margin-bottom: 12px;
          font-size: 14px;
        }
        .fallback {
          margin-top: 16px;
          font-size: 12px;
          color: #999;
        }
        .code-display {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 12px;
          margin: 16px 0;
          font-family: monospace;
          font-size: 14px;
          word-break: break-all;
        }
      `}</style>
    </div>
  );
}
