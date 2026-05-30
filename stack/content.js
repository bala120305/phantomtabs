/**
 * PhantomTabs Focus Mode Content Script
 * Runs on web pages to intercept blocked sites and render a lock screen during Focus Mode.
 * Uses a Shadow DOM to isolate styles and prevent host site CSS from breaking the overlay.
 */

(function () {
  // Prevent duplicate insertion
  if (window.phantomtabsOverlayLoaded) return;
  window.phantomtabsOverlayLoaded = true;

  // Immediately check with background worker if this site is blocked
  chrome.runtime.sendMessage({ action: "checkBlock" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("PhantomTabs connection failed:", chrome.runtime.lastError.message);
      return;
    }
    
    if (response && response.isBlocked) {
      injectBlockScreen(response.domain);
    }
  });

  // Listen for dynamic block signals from background worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "blockSite") {
      injectBlockScreen(message.domain);
      sendResponse({ success: true });
    }
  });

  /**
   * Injects a full-screen glassmorphism blocking overlay into the document
   * @param {string} domain - The domain that is blocked
   */
  function injectBlockScreen(domain) {
    // Hide original page scrollbars
    document.documentElement.style.setProperty("overflow", "hidden", "important");
    if (document.body) {
      document.body.style.setProperty("overflow", "hidden", "important");
    }

    // Create container element
    const container = document.createElement("div");
    container.id = "phantomtabs-block-screen-container";
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.width = "100vw";
    container.style.height = "100vh";
    container.style.zIndex = "9999999999"; // Ensure it sits on top of everything
    container.style.backgroundColor = "rgba(10, 10, 12, 0.95)";
    
    // Attach Shadow Root to insulate styles from host page stylesheet overrides
    const shadow = container.attachShadow({ mode: "closed" });
    
    // Create UI overlay
    const overlayHtml = `
      <style>
        :host {
          font-family: 'Outfit', 'Segoe UI', system-ui, -apple-system, sans-serif;
          color: #ffffff;
          box-sizing: border-box;
        }
        
        .backdrop {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at center, rgba(138, 43, 226, 0.15) 0%, rgba(10, 10, 12, 0) 70%);
          backdrop-filter: blur(25px);
          -webkit-backdrop-filter: blur(25px);
          padding: 20px;
          box-sizing: border-box;
        }

        .glow-sphere {
          position: absolute;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(138, 43, 226, 0.2) 0%, rgba(0, 242, 254, 0.05) 50%, rgba(0,0,0,0) 100%);
          filter: blur(40px);
          z-index: -1;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        
        .card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 48px;
          text-align: center;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5),
                      inset 0 1px 1px rgba(255, 255, 255, 0.1);
          animation: floatIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          box-sizing: border-box;
        }

        @keyframes floatIn {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        .icon-container {
          background: linear-gradient(135deg, rgba(138, 43, 226, 0.2) 0%, rgba(0, 242, 254, 0.2) 100%);
          border: 1px solid rgba(255, 255, 255, 0.15);
          width: 80px;
          height: 80px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          box-shadow: 0 0 30px rgba(138, 43, 226, 0.3);
        }

        .icon {
          width: 40px;
          height: 40px;
          fill: none;
          stroke: #00f2fe;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        
        h1 {
          font-size: 32px;
          font-weight: 700;
          margin: 0 0 12px 0;
          background: linear-gradient(135deg, #ffffff 30%, #a5a5a5 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .tagline {
          color: #a5a5a5;
          font-size: 16px;
          line-height: 1.6;
          margin: 0 0 32px 0;
        }

        .domain-tag {
          display: inline-block;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 6px 14px;
          border-radius: 100px;
          font-weight: 600;
          color: #00f2fe;
          font-size: 14px;
          margin-top: 8px;
        }
        
        .button-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        button {
          font-family: inherit;
          font-size: 15px;
          font-weight: 600;
          padding: 14px 28px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        
        .btn-primary {
          background: linear-gradient(135deg, #8a2be2 0%, #4a00e0 100%);
          color: #ffffff;
          box-shadow: 0 8px 20px rgba(138, 43, 226, 0.4);
        }
        
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 25px rgba(138, 43, 226, 0.6);
        }

        .btn-primary:active {
          transform: translateY(0);
        }
        
        .btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          color: #a5a5a5;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        
        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.15);
        }
      </style>
      
      <div class="backdrop">
        <div class="glow-sphere"></div>
        <div class="card">
          <div class="icon-container">
            <svg class="icon" viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h1>Focus Mode is Active</h1>
          <p class="tagline">
            Take back control of your time. This website is on your blocked list:<br>
            <span class="domain-tag">${domain}</span>
          </p>
          <div class="button-group">
            <button id="go-back-btn" class="btn-primary">Go Back & Stay Productive</button>
            <button id="bypass-btn" class="btn-secondary">Disable Focus Mode</button>
          </div>
        </div>
      </div>
    `;
    
    shadow.innerHTML = overlayHtml;
    
    // Inject the elements to Document
    if (document.body) {
      document.body.appendChild(container);
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        document.body.appendChild(container);
      });
    }
    
    // Add interactions
    shadow.getElementById("go-back-btn").addEventListener("click", () => {
      if (document.referrer) {
        window.history.back();
      } else {
        // Redirection backup if no history exists
        window.location.href = "https://github.com";
      }
    });
    
    shadow.getElementById("bypass-btn").addEventListener("click", () => {
      const confirmation = confirm("Focus Mode helps you build habit loops. Are you sure you want to stop it?");
      if (confirmation) {
        // Retrieve current settings and deactivate focus mode
        chrome.runtime.sendMessage({ action: "getLiveStats" }, (response) => {
          if (response && response.settings) {
            const newSettings = response.settings;
            newSettings.focusModeActive = false;
            
            chrome.runtime.sendMessage({
              action: "updateSettings",
              settings: newSettings
            }, () => {
              // Reload page to dismiss the blocking overlay
              window.location.reload();
            });
          }
        });
      }
    });
  }
})();
