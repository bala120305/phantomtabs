/**
 * PhantomTabs Background Service Worker (Manifest V3)
 * Tracks user browsing activity, manages storage, handles idle states and focus mode blocks.
 */

// Import analytics helper functions
importScripts("analytics.js");

// Active session tracking state (persisted in RAM while service worker is active)
let currentSession = {
  domain: null,
  title: null,
  startTime: null,
  tabId: null
};

let isUserIdle = false;
let isBrowserFocused = true;

// Default setting values
const DEFAULT_SETTINGS = {
  focusModeActive: false,
  focusBlocklist: ["facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "youtube.com"],
  categories: {}, // User custom domain category overrides
  dailyLimitSeconds: 7200, // 2 hours daily limit
  lastNotificationDate: ""
};

/**
 * Service Worker Installation & Setup
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log("PhantomTabs Tracker extension installed.");
  
  // Initialize storage if not already populated
  const storage = await chrome.storage.local.get(["settings", "trackingData"]);
  if (!storage.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  if (!storage.trackingData) {
    await chrome.storage.local.set({ trackingData: {} });
  }

  // Set idle detection interval to 15 seconds (lowest allowed by Chrome)
  chrome.idle.setDetectionInterval(15);
  
  // Initialize tracking
  await startTrackingActiveTab();
});

/**
 * Restores and resumes tracking when service worker wakes up
 */
chrome.runtime.onStartup.addListener(async () => {
  await startTrackingActiveTab();
});

/**
 * Periodic backup timer to save running time and prevent data loss 
 * due to unexpected crashes or service worker suspensions.
 */
setInterval(async () => {
  if (currentSession.domain && !isUserIdle && isBrowserFocused) {
    await updateAccumulatedTime();
  }
}, 10000); // Every 10 seconds

/**
 * Resumes tracking the currently selected active tab
 */
async function startTrackingActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      const activeTab = tabs[0];
      const domain = Analytics.getDomain(activeTab.url);
      
      // Avoid tracking chrome settings/extension pages
      if (domain && domain !== "System / Chrome") {
        currentSession = {
          domain: domain,
          title: activeTab.title || domain,
          startTime: Date.now(),
          tabId: activeTab.id
        };
        
        // Save current session to storage so if background sleeps, we still have the start time
        await chrome.storage.local.set({ activeSession: currentSession });
        
        // Check if Focus Mode needs to block this domain
        await checkAndApplyBlock(activeTab.id, activeTab.url);
      } else {
        await clearCurrentSession();
      }
    }
  } catch (error) {
    console.error("Error in startTrackingActiveTab:", error);
  }
}

/**
 * Saves and updates the accumulated duration for the active tracking session
 */
async function updateAccumulatedTime() {
  if (!currentSession.domain || !currentSession.startTime) return;

  const now = Date.now();
  const elapsedSeconds = Math.round((now - currentSession.startTime) / 1000);
  
  if (elapsedSeconds <= 0) return;

  // Reset starting time for the next slice of duration
  currentSession.startTime = now;
  await chrome.storage.local.set({ activeSession: currentSession });

  const dateKey = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
  const currentHour = new Date().getHours();

  // Load existing tracking database
  const result = await chrome.storage.local.get(["trackingData", "settings"]);
  const trackingData = result.trackingData || {};
  const settings = result.settings || DEFAULT_SETTINGS;

  if (!trackingData[dateKey]) {
    trackingData[dateKey] = {
      domains: {},
      hourlyActivity: new Array(24).fill(0)
    };
  }

  const dayData = trackingData[dateKey];

  // Initialize domain log if missing
  if (!dayData.domains[currentSession.domain]) {
    const defaultCat = Analytics.getDefaultCategory(currentSession.domain);
    const customCat = settings.categories[currentSession.domain];
    
    dayData.domains[currentSession.domain] = {
      title: currentSession.title,
      timeSpent: 0,
      visitCount: 0,
      category: customCat || defaultCat
    };
  }

  // Update time and title
  dayData.domains[currentSession.domain].timeSpent += elapsedSeconds;
  dayData.domains[currentSession.domain].title = currentSession.title; // Keep title updated
  
  // Track hour of activity
  if (!dayData.hourlyActivity) {
    dayData.hourlyActivity = new Array(24).fill(0);
  }
  dayData.hourlyActivity[currentHour] = (dayData.hourlyActivity[currentHour] || 0) + elapsedSeconds;

  // Save changes
  await chrome.storage.local.set({ trackingData });

  // Check if daily tracking limit is exceeded
  await checkDailyLimit(trackingData[dateKey], settings);
}

/**
 * Safely clears active session from RAM and storage
 */
async function clearCurrentSession() {
  currentSession = { domain: null, title: null, startTime: null, tabId: null };
  await chrome.storage.local.remove("activeSession");
}

/**
 * Checks if the total time browsed today exceeds limits and fires a notification
 */
async function checkDailyLimit(dayData, settings) {
  if (!settings.dailyLimitSeconds || settings.dailyLimitSeconds <= 0) return;

  // Calculate total time browsed today
  let totalSeconds = 0;
  for (const dom in dayData.domains) {
    totalSeconds += dayData.domains[dom].timeSpent;
  }

  if (totalSeconds >= settings.dailyLimitSeconds) {
    const today = new Date().toLocaleDateString('en-CA');
    
    // Only send notification once a day
    if (settings.lastNotificationDate !== today) {
      chrome.notifications.create("daily-limit-exceeded", {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Daily Browsing Limit Reached!",
        message: `You have spent ${Analytics.formatTime(totalSeconds)} browsing today. It might be time to take a break!`,
        priority: 2
      });

      settings.lastNotificationDate = today;
      await chrome.storage.local.set({ settings });
    }
  }
}

/**
 * Checks if focus mode block applies and sends instruction to content.js
 */
async function checkAndApplyBlock(tabId, url) {
  if (!tabId || !url) return;

  const domain = Analytics.getDomain(url);
  const result = await chrome.storage.local.get("settings");
  const settings = result.settings || DEFAULT_SETTINGS;

  if (settings.focusModeActive && isDomainBlocked(domain, settings.focusBlocklist)) {
    // Notify content script to display the blocking UI overlay
    try {
      // Delay slightly to ensure content script is ready
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { action: "blockSite", domain: domain });
      }, 300);
    } catch (e) {
      console.log("Could not send block message to tab (yet):", e);
    }
  }
}

/**
 * Checks if domain matches any item in block list
 */
function isDomainBlocked(domain, blocklist) {
  if (!domain || !blocklist) return false;
  return blocklist.some(blocked => {
    return domain === blocked || domain.endsWith("." + blocked);
  });
}

/**
 * Increments the visit count for a domain when the user opens a page
 */
async function recordVisit(domain, title) {
  if (!domain || domain === "System / Chrome") return;

  const dateKey = new Date().toLocaleDateString('en-CA');
  const result = await chrome.storage.local.get(["trackingData", "settings"]);
  const trackingData = result.trackingData || {};
  const settings = result.settings || DEFAULT_SETTINGS;

  if (!trackingData[dateKey]) {
    trackingData[dateKey] = {
      domains: {},
      hourlyActivity: new Array(24).fill(0)
    };
  }

  const dayData = trackingData[dateKey];
  if (!dayData.domains[domain]) {
    const defaultCat = Analytics.getDefaultCategory(domain);
    const customCat = settings.categories[domain];
    
    dayData.domains[domain] = {
      title: title,
      timeSpent: 0,
      visitCount: 0,
      category: customCat || defaultCat
    };
  }

  dayData.domains[domain].visitCount += 1;
  await chrome.storage.local.set({ trackingData });
}

/**
 * CHROME EVENT LISTENERS
 */

// 1. Tab switches
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // Save progress on the previous tab
  await updateAccumulatedTime();
  
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const domain = Analytics.getDomain(tab.url);

    if (domain && domain !== "System / Chrome") {
      currentSession = {
        domain: domain,
        title: tab.title || domain,
        startTime: Date.now(),
        tabId: tab.id
      };
      await chrome.storage.local.set({ activeSession: currentSession });
      await recordVisit(domain, currentSession.title);
      await checkAndApplyBlock(tab.id, tab.url);
    } else {
      await clearCurrentSession();
    }
  } catch (err) {
    console.error("Error handling tab switch:", err);
  }
});

// 2. Tab URL updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // We are only interested in active tab updates and when status is complete or URL has changed
  if (tab.active && (changeInfo.url || changeInfo.title)) {
    const domain = Analytics.getDomain(tab.url);
    
    if (domain && domain !== "System / Chrome") {
      // If it's a new domain or we were previously tracking nothing
      if (domain !== currentSession.domain) {
        await updateAccumulatedTime();
        
        currentSession = {
          domain: domain,
          title: tab.title || domain,
          startTime: Date.now(),
          tabId: tab.id
        };
        await chrome.storage.local.set({ activeSession: currentSession });
        await recordVisit(domain, currentSession.title);
      } else {
        // Just update title
        currentSession.title = tab.title || currentSession.title;
        await chrome.storage.local.set({ activeSession: currentSession });
      }

      await checkAndApplyBlock(tabId, tab.url);
    } else {
      await updateAccumulatedTime();
      await clearCurrentSession();
    }
  }
});

// 3. Browser Window Focus shifts (e.g. user Alt+Tabs to/from chrome)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // User left the chrome browser window entirely
    isBrowserFocused = false;
    await updateAccumulatedTime();
  } else {
    // User returned to chrome
    isBrowserFocused = true;
    await startTrackingActiveTab();
  }
});

// 4. User Idle State tracking
chrome.idle.onStateChanged.addListener(async (newState) => {
  console.log(`Idle state changed to: ${newState}`);
  if (newState === "idle" || newState === "locked") {
    // User is AFK - stop tracking and backdate to idle onset (15s ago)
    isUserIdle = true;
    
    if (currentSession.domain && currentSession.startTime) {
      // Backdate: Subtract 15 seconds of idle threshold detection
      const elapsed = Date.now() - currentSession.startTime;
      const idleOffsetMs = 15000;
      
      if (elapsed > idleOffsetMs) {
        // Roll back current startTime so we only add active duration
        currentSession.startTime = Date.now() - idleOffsetMs;
        await updateAccumulatedTime();
      }
      await clearCurrentSession();
    }
  } else if (newState === "active") {
    // User returned to keyboard/mouse
    isUserIdle = false;
    await startTrackingActiveTab();
  }
});

// 5. Message bus handling communication with Popup Dashboard and Content Scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getLiveStats") {
    // Return cumulative stats including current running session duration
    (async () => {
      // Update currently active tab time internally in DB first to get fully live stats
      if (currentSession.domain && !isUserIdle && isBrowserFocused) {
        await updateAccumulatedTime();
      }
      
      const storage = await chrome.storage.local.get(["trackingData", "settings"]);
      sendResponse({
        trackingData: storage.trackingData || {},
        settings: storage.settings || DEFAULT_SETTINGS,
        currentSession: currentSession.domain ? currentSession : null
      });
    })();
    return true; // Keep response channel open for async execution
  }
  
  if (request.action === "updateSettings") {
    (async () => {
      await chrome.storage.local.set({ settings: request.settings });
      
      // If focus mode settings changed, recheck active tab blocking
      if (request.settings.focusModeActive) {
        await startTrackingActiveTab();
      }
      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.action === "resetData") {
    (async () => {
      await chrome.storage.local.set({ trackingData: {} });
      await clearCurrentSession();
      await startTrackingActiveTab();
      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.action === "checkBlock") {
    const domain = Analytics.getDomain(sender.url);
    (async () => {
      const storage = await chrome.storage.local.get("settings");
      const settings = storage.settings || DEFAULT_SETTINGS;
      const isBlocked = settings.focusModeActive && isDomainBlocked(domain, settings.focusBlocklist);
      sendResponse({ isBlocked: isBlocked, domain: domain });
    })();
    return true;
  }
});

// 6. Action click listener (opens popup.html in full screen tab when extension toolbar icon is clicked)
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: "popup.html" });
});
