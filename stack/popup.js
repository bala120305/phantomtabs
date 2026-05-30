/**
 * PhantomTabs Popup Dashboard Controller
 * Connects the HTML UI with the analytics processor and background tracker.
 * Updates data views in real-time, configures Focus Mode, and controls settings.
 */

// Global Chart references for reuse and dynamic updates
let hourlyChartInstance = null;
let categoryChartInstance = null;

// Settings view report range ('daily' | 'weekly')
let currentReportRange = "daily";

document.addEventListener("DOMContentLoaded", () => {
  // Initialize navigation tabs
  setupNavigation();

  // Load and populate stats initially
  refreshDashboard();

  // Periodically refresh stats (every 3 seconds) for live counter updates
  setInterval(refreshDashboard, 3000);

  // Hook up event listeners
  setupEventListeners();
});

/**
 * Handles tab navigation click events to switch between screens
 */
function setupNavigation() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      // Deactivate all tabs and panels
      tabs.forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

      // Activate clicked tab
      tab.classList.add("active");
      
      // Show corresponding panel
      const targetId = tab.getAttribute("data-tab");
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add("active");
      }
    });
  });

  // Overview "View All" link redirection to Websites tab
  const viewAllLink = document.getElementById("view-all-websites-link");
  if (viewAllLink) {
    viewAllLink.addEventListener("click", () => {
      document.getElementById("tab-websites").click();
    });
  }
}

/**
 * Registers click, input, and slider listeners across the popup elements
 */
function setupEventListeners() {
  // Focus Mode toggle header pill
  const focusPill = document.getElementById("focus-pill-btn");
  if (focusPill) {
    focusPill.addEventListener("click", toggleFocusModeSetting);
  }

  // Focus Mode panel action button
  const toggleFocusBtn = document.getElementById("toggle-focus-mode-btn");
  if (toggleFocusBtn) {
    toggleFocusBtn.addEventListener("click", toggleFocusModeSetting);
  }

  // Focus Blocklist Form submission
  const blockForm = document.getElementById("add-block-form");
  if (blockForm) {
    blockForm.addEventListener("submit", handleAddBlockDomain);
  }

  // Export to CSV
  const exportBtn = document.getElementById("export-csv-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", handleCSVExport);
  }

  // Daily Allowance Range Slider
  const limitRange = document.getElementById("daily-limit-range");
  if (limitRange) {
    limitRange.addEventListener("input", (e) => {
      const hours = e.target.value;
      document.getElementById("daily-limit-lbl").textContent = `${hours} hrs`;
    });
    limitRange.addEventListener("change", handleDailyLimitChange);
  }

  // Data reset button
  const resetBtn = document.getElementById("reset-data-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", handleResetData);
  }

  // Report toggle buttons (Today vs Weekly)
  const reportDailyBtn = document.getElementById("report-daily-btn");
  const reportWeeklyBtn = document.getElementById("report-weekly-btn");

  if (reportDailyBtn && reportWeeklyBtn) {
    reportDailyBtn.addEventListener("click", () => {
      reportDailyBtn.classList.add("active");
      reportWeeklyBtn.classList.remove("active");
      currentReportRange = "daily";
      updateReportAverages();
    });

    reportWeeklyBtn.addEventListener("click", () => {
      reportWeeklyBtn.classList.add("active");
      reportDailyBtn.classList.remove("active");
      currentReportRange = "weekly";
      updateReportAverages();
    });
  }

  // Websites search filter input
  const searchInput = document.getElementById("site-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", filterWebsitesTable);
  }

  // Websites category filter dropdown
  const catFilter = document.getElementById("category-filter-select");
  if (catFilter) {
    catFilter.addEventListener("change", filterWebsitesTable);
  }
}

/**
 * Contacts the background script, pulls current statistics, and updates the popup views
 */
function refreshDashboard() {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
    console.log("Mock Mode: Chrome Extension APIs not available. Displaying demo values.");
    renderMockData();
    return;
  }

  chrome.runtime.sendMessage({ action: "getLiveStats" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("PhantomTabs service worker is sleeping/disconnected:", chrome.runtime.lastError.message);
      return;
    }

    if (!response) return;

    const { trackingData, settings, currentSession } = response;
    const todayStr = new Date().toLocaleDateString('en-CA');
    const todayData = trackingData[todayStr] || { domains: {}, hourlyActivity: new Array(24).fill(0) };

    // Process daily stats using the analytics helper
    const dailyStats = Analytics.aggregateDailyStats(todayData);

    // 1. Update Header / Status
    updateHeaderStatus(settings.focusModeActive, currentSession);

    // 2. Update Overview Numbers
    document.getElementById("total-time-val").textContent = Analytics.formatTime(dailyStats.totalTime);
    document.getElementById("total-visits-val").textContent = `${dailyStats.totalVisits} visits today`;
    document.getElementById("productivity-score-val").textContent = `${dailyStats.productivityScore}%`;
    document.getElementById("score-bar-fill").style.width = `${dailyStats.productivityScore}%`;

    // 3. Update Charts
    renderHourlyChart(todayData.hourlyActivity || new Array(24).fill(0));
    renderCategoryChart(dailyStats.timeByCategory);

    // 4. Update Top Domains list (Dashboard overview)
    populateTopDomains(dailyStats.topDomains, dailyStats.totalTime);

    // 5. Populate Website Table (Sites tab)
    populateWebsitesTable(todayData.domains);

    // 6. Populate Settings range averages
    updateSettingsFormValues(settings);
    updateReportAverages(trackingData);

    // 7. Populate Focus blocklist
    populateBlocklistTags(settings.focusBlocklist);
  });
}

/**
 * Fallback renderer when running outside the Chrome extension environment
 */
function renderMockData() {
  const settings = {
    focusModeActive: true,
    focusBlocklist: ["facebook.com", "instagram.com", "tiktok.com", "youtube.com"],
    dailyLimitSeconds: 7200,
    categories: {}
  };
  
  const mockTrackingData = {
    domains: {
      "github.com": { title: "GitHub: Let's build from here · GitHub", timeSpent: 5400, visitCount: 22, category: "Work" },
      "stackoverflow.com": { title: "Stack Overflow - Where Developers Learn, Share & Build", timeSpent: 2800, visitCount: 8, category: "Work" },
      "wikipedia.org": { title: "Time Tracking - Wikipedia", timeSpent: 1800, visitCount: 4, category: "Education" },
      "google.com": { title: "Google Search", timeSpent: 1200, visitCount: 15, category: "Search" },
      "youtube.com": { title: "Watch Cool Dev Tools tutorials - YouTube", timeSpent: 3600, visitCount: 5, category: "Entertainment" },
      "facebook.com": { title: "Facebook Feed", timeSpent: 900, visitCount: 12, category: "Social" },
      "amazon.com": { title: "Shopping Cart", timeSpent: 450, visitCount: 3, category: "Shopping" }
    },
    hourlyActivity: [0, 0, 0, 0, 0, 0, 120, 360, 900, 1800, 2400, 1500, 600, 1800, 2800, 2100, 900, 600, 120, 0, 0, 0, 0, 0]
  };

  const dailyStats = Analytics.aggregateDailyStats(mockTrackingData);
  
  // 1. Update Header / Status
  updateHeaderStatus(settings.focusModeActive, { domain: "github.com" });

  // 2. Update Overview Numbers
  document.getElementById("total-time-val").textContent = Analytics.formatTime(dailyStats.totalTime);
  document.getElementById("total-visits-val").textContent = `${dailyStats.totalVisits} visits today`;
  document.getElementById("productivity-score-val").textContent = `${dailyStats.productivityScore}%`;
  document.getElementById("score-bar-fill").style.width = `${dailyStats.productivityScore}%`;

  // 3. Update Charts
  renderHourlyChart(mockTrackingData.hourlyActivity);
  renderCategoryChart(dailyStats.timeByCategory);

  // 4. Update Top Domains list (Dashboard overview)
  populateTopDomains(dailyStats.topDomains, dailyStats.totalTime);

  // 5. Populate Website Table (Sites tab)
  populateWebsitesTable(mockTrackingData.domains);

  // 6. Populate Settings range averages
  updateSettingsFormValues(settings);
  
  const todayStr = new Date().toLocaleDateString('en-CA');
  const trackingHistory = {};
  trackingHistory[todayStr] = mockTrackingData;
  updateReportAverages(trackingHistory);

  // 7. Populate Focus blocklist
  populateBlocklistTags(settings.focusBlocklist);
}


/**
 * Updates UI headers to show current tracking state and active Focus Mode indicators
 */
function updateHeaderStatus(focusActive, activeSession) {
  const statusText = document.getElementById("status-text");
  const focusPill = document.getElementById("focus-pill-btn");
  const focusHeroSection = document.getElementById("focus-view");
  const focusBtn = document.getElementById("toggle-focus-mode-btn");

  if (activeSession && activeSession.domain) {
    statusText.textContent = `Tracking: ${activeSession.domain}`;
  } else {
    statusText.textContent = "Idle / Inactive";
  }

  if (focusActive) {
    focusPill.classList.add("active");
    focusPill.querySelector(".focus-status-lbl").textContent = "Focus: On";
    focusHeroSection.classList.add("focus-active-state");
    focusBtn.textContent = "Disable Focus Mode";
    focusBtn.className = "btn btn-danger";
  } else {
    focusPill.classList.remove("active");
    focusPill.querySelector(".focus-status-lbl").textContent = "Focus: Off";
    focusHeroSection.classList.remove("focus-active-state");
    focusBtn.textContent = "Enable Focus Mode";
    focusBtn.className = "btn btn-primary";
  }
}

/**
 * Handles turning Focus Mode on/off in the storage and updates state
 */
function toggleFocusModeSetting() {
  chrome.runtime.sendMessage({ action: "getLiveStats" }, (response) => {
    if (!response) return;
    const settings = response.settings;
    settings.focusModeActive = !settings.focusModeActive;

    chrome.runtime.sendMessage({ action: "updateSettings", settings }, () => {
      refreshDashboard();
    });
  });
}

/**
 * Adds a domain path to the Focus Mode blocklist
 */
function handleAddBlockDomain(e) {
  e.preventDefault();
  const input = document.getElementById("block-domain-input");
  let domain = input.value.trim().toLowerCase();
  
  if (!domain) return;

  // Basic cleanup: remove protocol/subdomains if user paste a URL
  try {
    if (domain.includes("://") || !domain.startsWith("http")) {
      // Append protocol momentarily to parse
      const testUrl = domain.includes("://") ? domain : "http://" + domain;
      const url = new URL(testUrl);
      domain = url.hostname;
      if (domain.startsWith("www.")) {
        domain = domain.substring(4);
      }
    }
  } catch (e) {
    // Keep raw string if parsing fails
  }

  chrome.runtime.sendMessage({ action: "getLiveStats" }, (response) => {
    if (!response) return;
    const settings = response.settings;

    if (!settings.focusBlocklist.includes(domain)) {
      settings.focusBlocklist.push(domain);
      
      chrome.runtime.sendMessage({ action: "updateSettings", settings }, () => {
        input.value = "";
        refreshDashboard();
      });
    } else {
      alert("This domain is already blocked.");
    }
  });
}

/**
 * Removes a domain from the Focus Mode blocklist
 */
function removeBlockedDomain(domain) {
  chrome.runtime.sendMessage({ action: "getLiveStats" }, (response) => {
    if (!response) return;
    const settings = response.settings;
    settings.focusBlocklist = settings.focusBlocklist.filter(d => d !== domain);

    chrome.runtime.sendMessage({ action: "updateSettings", settings }, () => {
      refreshDashboard();
    });
  });
}

/**
 * Renders focus block tags with remove triggers in the DOM
 */
function populateBlocklistTags(blocklist) {
  const container = document.getElementById("blocklist-items");
  if (!container) return;

  if (!blocklist || blocklist.length === 0) {
    container.innerHTML = `<span class="empty-state">No websites blocked yet.</span>`;
    return;
  }

  container.innerHTML = blocklist.map(domain => `
    <div class="blocklist-tag">
      <span>${domain}</span>
      <button class="remove-block-btn" data-domain="${domain}">&times;</button>
    </div>
  `).join("");

  // Attach delete events
  container.querySelectorAll(".remove-block-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const domain = btn.getAttribute("data-domain");
      removeBlockedDomain(domain);
    });
  });
}

/**
 * Renders or updates the line chart showing browsing minutes by hour of the day
 */
function renderHourlyChart(hourlyData) {
  const canvas = document.getElementById("hourlyActivityChart");
  if (!canvas) return;

  // Convert raw seconds to minutes for clean graphing
  const hourlyMinutes = hourlyData.map(seconds => Math.round(seconds / 60));

  const hoursLabel = Array.from({ length: 24 }, (_, i) => {
    if (i === 0) return "12am";
    if (i === 12) return "12pm";
    return i > 12 ? `${i - 12}pm` : `${i}am`;
  });

  if (hourlyChartInstance) {
    // Update existing chart datasets
    hourlyChartInstance.data.datasets[0].data = hourlyMinutes;
    hourlyChartInstance.update("none"); // Update silently without reset animations
  } else {
    const ctx = canvas.getContext("2d");
    hourlyChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: hoursLabel,
        datasets: [{
          label: "Minutes",
          data: hourlyMinutes,
          borderColor: "#00f2fe",
          borderWidth: 2,
          backgroundColor: "rgba(0, 242, 254, 0.05)",
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: "#8a2be2"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label: function(context) {
                return `${context.parsed.y} mins`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: "rgba(255, 255, 255, 0.03)" },
            ticks: {
              color: "#9f9baa",
              font: { size: 9 },
              maxTicksLimit: 6
            }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.03)" },
            ticks: {
              color: "#9f9baa",
              font: { size: 9 },
              beginAtZero: true
            }
          }
        }
      }
    });
  }
}

/**
 * Renders or updates the doughnut chart showing active hours spent by category
 */
function renderCategoryChart(categoriesData) {
  const canvas = document.getElementById("categoryChart");
  if (!canvas) return;

  const categories = Object.keys(categoriesData);
  const rawTimes = Object.values(categoriesData);

  // Convert raw seconds to hours (or fractions of hour)
  const categoryHours = rawTimes.map(sec => parseFloat((sec / 3600).toFixed(2)));

  // Filter out categories with zero browsing time to prevent empty slices
  const activeIndices = categoryHours.map((h, i) => h > 0 ? i : -1).filter(idx => idx !== -1);
  const activeLabels = activeIndices.map(idx => categories[idx]);
  const activeHours = activeIndices.map(idx => categoryHours[idx]);

  // Color Mapping
  const colorMap = {
    "Work": "#3897f5",
    "Education": "#00e676",
    "Search": "#ffeb3b",
    "News": "#ff9100",
    "Social": "#f50057",
    "Entertainment": "#9c27b0",
    "Shopping": "#ff5722",
    "Other": "#78909c"
  };
  const activeColors = activeLabels.map(cat => colorMap[cat] || "#ffffff");

  if (categoryChartInstance) {
    categoryChartInstance.data.labels = activeLabels;
    categoryChartInstance.data.datasets[0].data = activeHours;
    categoryChartInstance.data.datasets[0].backgroundColor = activeColors;
    categoryChartInstance.update("none");
  } else {
    const ctx = canvas.getContext("2d");
    categoryChartInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: activeLabels,
        datasets: [{
          data: activeHours,
          backgroundColor: activeColors,
          borderWidth: 1,
          borderColor: "rgba(10, 7, 18, 0.9)"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "70%",
        plugins: {
          legend: {
            position: "right",
            labels: {
              boxWidth: 8,
              color: "#9f9baa",
              font: { size: 9 }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const value = context.parsed;
                const hours = Math.floor(value);
                const minutes = Math.round((value - hours) * 60);
                
                if (hours > 0) {
                  return `${context.label}: ${hours}h ${minutes}m`;
                }
                return `${context.label}: ${minutes}m`;
              }
            }
          }
        }
      }
    });
  }
}

/**
 * Builds the list of top 10 visited domains in the Overview dashboard panel
 */
function populateTopDomains(topDomains, totalTime) {
  const container = document.getElementById("top-domains-list");
  if (!container) return;

  if (!topDomains || topDomains.length === 0) {
    container.innerHTML = `<div class="empty-state">No browsing data recorded yet.</div>`;
    return;
  }

  container.innerHTML = topDomains.map(item => {
    // Calculate percentage for progress bar
    const percentage = totalTime > 0 ? Math.round((item.timeSpent / totalTime) * 100) : 0;
    const categoryClass = item.category.toLowerCase();
    
    return `
      <div class="domain-row">
        <div class="domain-info">
          <div class="domain-category-container">
            <span class="prod-indicator ${item.prodType}"></span>
            <span class="domain-name" title="${item.domain}">${item.domain}</span>
            <span class="badge ${categoryClass}">${item.category}</span>
          </div>
          <span class="domain-title-desc" title="${item.title}">${item.title}</span>
        </div>
        <div class="domain-time">
          <span class="time-val">${Analytics.formatTime(item.timeSpent)}</span>
          <span class="visit-count-val">${item.visitCount} visits (${percentage}%)</span>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Populates all tracked domains inside the table on the Sites tab
 */
function populateWebsitesTable(domainsData) {
  const tableBody = document.getElementById("full-site-list-body");
  if (!tableBody) return;

  if (!domainsData || Object.keys(domainsData).length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" align="center" class="empty-state">No website history found.</td></tr>`;
    document.getElementById("unique-domains-count").textContent = "0 websites tracked";
    return;
  }

  const sortedList = Object.keys(domainsData).map(domain => {
    const item = domainsData[domain];
    return {
      domain,
      title: item.title,
      timeSpent: item.timeSpent,
      visitCount: item.visitCount,
      category: item.category || Analytics.getDefaultCategory(domain),
      prodType: Analytics.getProductivityType(item.category || Analytics.getDefaultCategory(domain))
    };
  }).sort((a, b) => b.timeSpent - a.timeSpent);

  document.getElementById("unique-domains-count").textContent = `${sortedList.length} websites tracked`;

  tableBody.innerHTML = sortedList.map(item => {
    const categoryClass = item.category.toLowerCase();
    return `
      <tr class="table-site-row" data-domain="${item.domain}" data-title="${item.title}" data-category="${item.category}">
        <td>
          <div class="table-domain-info">
            <span class="prod-indicator ${item.prodType}" title="${item.prodType}"></span>
            <div style="display: flex; flex-direction: column; overflow: hidden;">
              <span class="table-domain-name" title="${item.domain}">${item.domain}</span>
              <span class="domain-title-desc" title="${item.title}">${item.title}</span>
            </div>
          </div>
        </td>
        <td><span class="badge ${categoryClass}">${item.category}</span></td>
        <td>${item.visitCount}</td>
        <td align="right" class="time-val">${Analytics.formatTime(item.timeSpent)}</td>
      </tr>
    `;
  }).join("");

  // Re-apply filters in case the table updated while search criteria was typed
  filterWebsitesTable();
}

/**
 * Filter handler for sites view table
 */
function filterWebsitesTable() {
  const searchInput = document.getElementById("site-search-input");
  const catSelect = document.getElementById("category-filter-select");
  const rows = document.querySelectorAll(".table-site-row");

  if (!rows || rows.length === 0) return;

  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const filterCat = catSelect ? catSelect.value : "all";

  rows.forEach(row => {
    const domain = row.getAttribute("data-domain").toLowerCase();
    const title = row.getAttribute("data-title").toLowerCase();
    const category = row.getAttribute("data-category");

    const matchesSearch = domain.includes(searchQuery) || title.includes(searchQuery);
    const matchesCategory = filterCat === "all" || category === filterCat;

    if (matchesSearch && matchesCategory) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}

/**
 * Syncs the Settings tab controls with storage values
 */
function updateSettingsFormValues(settings) {
  const dailyLimitSeconds = settings.dailyLimitSeconds || 7200;
  const hours = (dailyLimitSeconds / 3600).toFixed(1);
  
  // Set slider position and text label
  const range = document.getElementById("daily-limit-range");
  if (range && !range.matches(':focus')) {
    range.value = hours;
    document.getElementById("daily-limit-lbl").textContent = `${hours} hrs`;
  }
}

/**
 * Updates average analytics figures displayed in Settings (Daily vs Weekly view)
 */
function updateReportAverages(trackingData) {
  if (!trackingData) {
    chrome.runtime.sendMessage({ action: "getLiveStats" }, (response) => {
      if (response && response.trackingData) {
        calculateAndRenderReport(response.trackingData);
      }
    });
  } else {
    calculateAndRenderReport(trackingData);
  }
}

function calculateAndRenderReport(trackingData) {
  const avgTimeLbl = document.getElementById("avg-daily-time");
  const avgScoreLbl = document.getElementById("avg-productivity-score");
  const worstDomainLbl = document.getElementById("worst-distraction-domain");

  if (!avgTimeLbl) return;

  let score = 100;
  let time = 0;
  let worstDomain = "None";

  if (currentReportRange === "daily") {
    // Current day stats
    const todayStr = new Date().toLocaleDateString('en-CA');
    const dayData = trackingData[todayStr];
    if (dayData) {
      const stats = Analytics.aggregateDailyStats(dayData);
      time = stats.totalTime;
      score = stats.productivityScore;
      if (stats.distractingDomains.length > 0) {
        worstDomain = stats.distractingDomains[0].domain;
      }
    }
  } else {
    // Last 7 days stats
    const stats = Analytics.aggregatePeriodStats(trackingData, 7);
    
    // Calculate average daily time
    const activeDays = Object.keys(stats.dailyTotals).length || 1;
    time = Math.round(stats.totalTime / activeDays);
    score = stats.averageProductivityScore;
    if (stats.distractingDomainsList.length > 0) {
      worstDomain = stats.distractingDomainsList[0].domain;
    }
  }

  avgTimeLbl.textContent = Analytics.formatTime(time);
  avgScoreLbl.textContent = `${score}%`;
  worstDomainLbl.textContent = worstDomain;
}

/**
 * Triggers saving daily allowance threshold values to database
 */
function handleDailyLimitChange(e) {
  const hours = parseFloat(e.target.value);
  const seconds = Math.round(hours * 3600);

  chrome.runtime.sendMessage({ action: "getLiveStats" }, (response) => {
    if (!response) return;
    const settings = response.settings;
    settings.dailyLimitSeconds = seconds;

    chrome.runtime.sendMessage({ action: "updateSettings", settings }, () => {
      console.log(`Daily limit updated to ${hours} hours.`);
    });
  });
}

/**
 * Triggers full data reset event with validation prompt
 */
function handleResetData() {
  const confirmReset = confirm("Are you absolutely sure you want to delete all accumulated productivity tracking data? This action cannot be undone.");
  if (confirmReset) {
    chrome.runtime.sendMessage({ action: "resetData" }, (response) => {
      if (response && response.success) {
        alert("PhantomTabs database reset successful.");
        // Reset local charts
        if (hourlyChartInstance) {
          hourlyChartInstance.destroy();
          hourlyChartInstance = null;
        }
        if (categoryChartInstance) {
          categoryChartInstance.destroy();
          categoryChartInstance = null;
        }
        refreshDashboard();
      }
    });
  }
}

/**
 * Compiles today's metrics and starts CSV download
 */
function handleCSVExport() {
  chrome.runtime.sendMessage({ action: "getLiveStats" }, (response) => {
    if (!response) return;

    const todayStr = new Date().toLocaleDateString('en-CA');
    const dayData = response.trackingData[todayStr];

    if (!dayData || !dayData.domains || Object.keys(dayData.domains).length === 0) {
      alert("No data recorded today to export.");
      return;
    }

    const csvContent = Analytics.generateCSV(dayData.domains);
    
    // Create download element
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.setAttribute("href", url);
    link.setAttribute("download", `phantomtabs_browsing_report_${todayStr}.csv`);
    link.style.visibility = "hidden";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}
