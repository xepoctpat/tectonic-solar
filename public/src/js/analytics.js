// ===== VERCEL WEB ANALYTICS INITIALIZATION =====
// Manually inject Vercel Web Analytics for vanilla JavaScript projects
// Based on: https://vercel.com/docs/analytics/quickstart

/**
 * Initialize Vercel Web Analytics
 * This function injects the analytics tracking script into the page
 */
export function initAnalytics() {
  // Initialize the analytics queue
  window.va = window.va || function () { 
    (window.vaq = window.vaq || []).push(arguments); 
  };

  // Create and inject the analytics script
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  
  // Append to document head
  document.head.appendChild(script);
  
  console.log('Vercel Web Analytics initialized');
}
