/**
 * Chronos Analytics Library
 * Handles time tracking calculations, domain categorization, productivity analysis, and data export.
 */

// Define global namespace for analytics to make it accessible to popup.js and background.js
const Analytics = {
  // Predefined categorization rules for common websites
  PRESET_CATEGORIES: {
    // Work & Tech Development
    "github.com": "Work",
    "github.dev": "Work",
    "stackoverflow.com": "Work",
    "stackexchange.com": "Work",
    "gitlab.com": "Work",
    "bitbucket.org": "Work",
    "notion.so": "Work",
    "notion.site": "Work",
    "trello.com": "Work",
    "jira.com": "Work",
    "atlassian.net": "Work",
    "figma.com": "Work",
    "slack.com": "Work",
    "teams.microsoft.com": "Work",
    "zoom.us": "Work",
    "meet.google.com": "Work",
    "docs.google.com": "Work",
    "drive.google.com": "Work",
    "sheets.google.com": "Work",
    "slides.google.com": "Work",
    "codepen.io": "Work",
    "jsfiddle.net": "Work",
    
    // Social Media
    "facebook.com": "Social",
    "instagram.com": "Social",
    "twitter.com": "Social",
    "x.com": "Social",
    "linkedin.com": "Social",
    "reddit.com": "Social",
    "tiktok.com": "Social",
    "pinterest.com": "Social",
    "tumblr.com": "Social",
    "snapchat.com": "Social",

    // Entertainment & Media
    "youtube.com": "Entertainment",
    "netflix.com": "Entertainment",
    "twitch.tv": "Entertainment",
    "spotify.com": "Entertainment",
    "vimeo.com": "Entertainment",
    "hulu.com": "Entertainment",
    "disneyplus.com": "Entertainment",
    "hbomax.com": "Entertainment",
    "amazon.com/prime-video": "Entertainment",
    "soundcloud.com": "Entertainment",

    // News & Information
    "wikipedia.org": "Education",
    "coursera.org": "Education",
    "udemy.com": "Education",
    "edx.org": "Education",
    "khanacademy.org": "Education",
    "medium.com": "News",
    "nytimes.com": "News",
    "cnn.com": "News",
    "bbc.com": "News",
    "bbc.co.uk": "News",
    "reuters.com": "News",
    "techcrunch.com": "News",
    "wired.com": "News",
    "forbes.com": "News",
    "bloomberg.com": "News",

    // Shopping
    "amazon.com": "Shopping",
    "amazon.in": "Shopping",
    "ebay.com": "Shopping",
    "aliexpress.com": "Shopping",
    "target.com": "Shopping",
    "walmart.com": "Shopping",
    "etsy.com": "Shopping",
    
    // Search Engines & Portals
    "google.com": "Search",
    "bing.com": "Search",
    "duckduckgo.com": "Search",
    "yahoo.com": "Search",
    "baidu.com": "Search"
  },

  // Define productivity scores by category
  // Ranges: 1.0 (highly productive) to 0.0 (distracting)
  CATEGORY_PRODUCTIVITY: {
    "Work": 1.0,
    "Education": 1.0,
    "Search": 0.7,
    "News": 0.5,
    "Shopping": 0.2,
    "Social": 0.1,
    "Entertainment": 0.1,
    "Other": 0.5
  },

  /**
   * Extracts clean domain from a URL string
   * @param {string} urlString - The full URL of a website
   * @returns {string} The cleaned domain (e.g. google.com)
   */
  getDomain: function(urlString) {
    try {
      if (!urlString) return "";
      // Handle chrome pages
      if (urlString.startsWith("chrome://") || urlString.startsWith("chrome-extension://")) {
        return "System / Chrome";
      }
      
      const url = new URL(urlString);
      let hostname = url.hostname;
      
      // Strip 'www.' if present
      if (hostname.startsWith("www.")) {
        hostname = hostname.substring(4);
      }
      return hostname;
    } catch (e) {
      console.error("Error extracting domain from URL:", urlString, e);
      return "";
    }
  },

  /**
   * Determines the category of a domain based on presets
   * @param {string} domain - The cleaned domain name
   * @returns {string} The category name (Work, Social, Entertainment, etc.)
   */
  getDefaultCategory: function(domain) {
    if (!domain || domain === "System / Chrome") return "Other";
    
    // Check direct match
    if (this.PRESET_CATEGORIES[domain]) {
      return this.PRESET_CATEGORIES[domain];
    }
    
    // Check subdomain matching (e.g. docs.google.com will match google.com if not explicitly defined)
    const parts = domain.split(".");
    if (parts.length > 2) {
      const parentDomain = parts.slice(-2).join(".");
      if (this.PRESET_CATEGORIES[parentDomain]) {
        return this.PRESET_CATEGORIES[parentDomain];
      }
    }
    
    return "Other";
  },

  /**
   * Checks whether a category is Productive, Neutral, or Distracting
   * @param {string} category - The category of the website
   * @returns {string} 'productive' | 'neutral' | 'distracting'
   */
  getProductivityType: function(category) {
    const score = this.CATEGORY_PRODUCTIVITY[category] || 0.5;
    if (score >= 0.7) return "productive";
    if (score <= 0.2) return "distracting";
    return "neutral";
  },

  /**
   * Formats duration in seconds to a human-readable string (e.g. 2h 15m 30s)
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted time string
   */
  formatTime: function(seconds) {
    if (!seconds || seconds <= 0) return "0s";
    
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    
    return parts.join(" ");
  },

  /**
   * Computes the average productivity score (0 - 100) based on domain times
   * @param {Object} domainsData - Domain data dictionary from storage
   * @returns {number} Productivity score from 0 to 100
   */
  calculateProductivityScore: function(domainsData) {
    if (!domainsData || Object.keys(domainsData).length === 0) return 100;
    
    let totalWeightedTime = 0;
    let totalTrackedTime = 0;
    
    for (const domain in domainsData) {
      const data = domainsData[domain];
      // Skip system tabs
      if (domain === "System / Chrome") continue;
      
      const category = data.category || this.getDefaultCategory(domain);
      const weight = this.CATEGORY_PRODUCTIVITY[category] !== undefined 
                     ? this.CATEGORY_PRODUCTIVITY[category] 
                     : 0.5;
      
      totalWeightedTime += (data.timeSpent * weight);
      totalTrackedTime += data.timeSpent;
    }
    
    if (totalTrackedTime === 0) return 100;
    
    return Math.round((totalWeightedTime / totalTrackedTime) * 100);
  },

  /**
   * Aggregates stats for a single day
   * @param {Object} dayData - Storage object for a single day
   * @returns {Object} Aggregated metrics
   */
  aggregateDailyStats: function(dayData) {
    const stats = {
      totalTime: 0,
      totalVisits: 0,
      productivityScore: 100,
      timeByCategory: {},
      timeByProductivity: { productive: 0, neutral: 0, distracting: 0 },
      topDomains: [],
      distractingDomains: []
    };

    if (!dayData || !dayData.domains) return stats;

    const domains = dayData.domains;
    const domainList = [];

    // Initialize category keys
    Object.keys(this.CATEGORY_PRODUCTIVITY).forEach(cat => {
      stats.timeByCategory[cat] = 0;
    });

    for (const domain in domains) {
      const item = domains[domain];
      stats.totalTime += item.timeSpent;
      stats.totalVisits += item.visitCount;

      const category = item.category || this.getDefaultCategory(domain);
      if (!stats.timeByCategory[category]) {
        stats.timeByCategory[category] = 0;
      }
      stats.timeByCategory[category] += item.timeSpent;

      const prodType = this.getProductivityType(category);
      stats.timeByProductivity[prodType] += item.timeSpent;

      domainList.push({
        domain,
        title: item.title,
        timeSpent: item.timeSpent,
        visitCount: item.visitCount,
        category,
        prodType
      });
    }

    // Sort domains by time spent
    domainList.sort((a, b) => b.timeSpent - a.timeSpent);
    stats.topDomains = domainList.slice(0, 10);
    
    // Distracting domains sorted by time spent
    stats.distractingDomains = domainList
      .filter(item => item.prodType === "distracting")
      .slice(0, 5);

    stats.productivityScore = this.calculateProductivityScore(domains);

    return stats;
  },

  /**
   * Aggregates history over the last N days
   * @param {Object} trackingData - Full daily tracking history from storage
   * @param {number} numDays - Number of days to aggregate (default 7)
   * @returns {Object} Weekly aggregated statistics
   */
  aggregatePeriodStats: function(trackingData, numDays = 7) {
    const stats = {
      totalTime: 0,
      totalVisits: 0,
      productivityScores: [],
      averageProductivityScore: 100,
      timeByCategory: {},
      dailyTotals: {}, // key: date string, value: time in seconds
      topDomains: {}
    };

    if (!trackingData) return stats;

    // Get sorted array of dates
    const dates = Object.keys(trackingData).sort().slice(-numDays);

    dates.forEach(date => {
      const dayData = trackingData[date];
      const dailyStats = this.aggregateDailyStats(dayData);
      
      stats.totalTime += dailyStats.totalTime;
      stats.totalVisits += dailyStats.totalVisits;
      stats.productivityScores.push(dailyStats.productivityScore);
      stats.dailyTotals[date] = dailyStats.totalTime;

      // Accumulate categories
      for (const cat in dailyStats.timeByCategory) {
        if (!stats.timeByCategory[cat]) stats.timeByCategory[cat] = 0;
        stats.timeByCategory[cat] += dailyStats.timeByCategory[cat];
      }

      // Accumulate domains
      if (dayData.domains) {
        for (const dom in dayData.domains) {
          const item = dayData.domains[dom];
          if (!stats.topDomains[dom]) {
            stats.topDomains[dom] = {
              domain: dom,
              title: item.title,
              timeSpent: 0,
              visitCount: 0,
              category: item.category || this.getDefaultCategory(dom)
            };
          }
          stats.topDomains[dom].timeSpent += item.timeSpent;
          stats.topDomains[dom].visitCount += item.visitCount;
        }
      }
    });

    // Compute average productivity score
    if (stats.productivityScores.length > 0) {
      const sum = stats.productivityScores.reduce((a, b) => a + b, 0);
      stats.averageProductivityScore = Math.round(sum / stats.productivityScores.length);
    }

    // Convert topDomains object to sorted array
    const sortedDomains = Object.values(stats.topDomains)
      .sort((a, b) => b.timeSpent - a.timeSpent);
    
    stats.topDomainsList = sortedDomains.slice(0, 10);
    stats.distractingDomainsList = sortedDomains
      .filter(item => this.getProductivityType(item.category) === "distracting")
      .slice(0, 5);

    return stats;
  },

  /**
   * Generates CSV content from domains tracking data
   * @param {Object} domainsData - Domain data dictionary
   * @returns {string} CSV format text
   */
  generateCSV: function(domainsData) {
    if (!domainsData || Object.keys(domainsData).length === 0) {
      return "Domain,Title,Category,Productivity Type,Time Spent (Seconds),Time Spent (Formatted),Visit Count\n";
    }

    let csvContent = "Domain,Title,Category,Productivity Type,Time Spent (Seconds),Time Spent (Formatted),Visit Count\n";
    
    for (const domain in domainsData) {
      const data = domainsData[domain];
      const category = data.category || this.getDefaultCategory(domain);
      const prodType = this.getProductivityType(category);
      
      // Clean title for CSV output (replace quotes, escape commas)
      const cleanTitle = (data.title || "")
        .replace(/"/g, '""')
        .replace(/\r?\n|\r/g, " ");

      const timeFormatted = this.formatTime(data.timeSpent);
      
      csvContent += `"${domain}","${cleanTitle}","${category}","${prodType}",${data.timeSpent},"${timeFormatted}",${data.visitCount}\n`;
    }
    
    return csvContent;
  }
};

// Export to module system for background.js (running in service worker environment)
if (typeof module !== "undefined" && module.exports) {
  module.exports = Analytics;
}
