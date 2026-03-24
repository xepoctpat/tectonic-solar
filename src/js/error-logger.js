/**
 * Error Logger for Proto-SIR Learning
 * Captures frontend errors and upstream failures for pattern learning
 * 
 * Design Principles:
 * 1. Non-critical upstream failures (502, timeouts) are logged, not thrown
 * 2. Each failure becomes a learning signal for Proto-SIR
 * 3. User sees graceful fallbacks, not console errors
 * 4. Researchers can audit all failures via server logs
 */

class ErrorLogger {
  constructor(options = {}) {
    this.logEndpoint = options.logEndpoint || '/api/proto-sir/log-event';
    this.isProxyMode = options.isProxyMode !== false;
    this.suppressConsoleErrors = options.suppressConsoleErrors !== false;
    this.criticalErrorPatterns = options.criticalErrorPatterns || [];
  }

  /**
   * Log an error event (async, non-blocking)
   */
  async logError(error, context = {}) {
    const errorData = {
      message: error?.message || String(error),
      type: error?.type || typeof error,
      timestamp: new Date().toISOString(),
      ...context,
      url: context.url || window.location.href,
      userAgent: navigator.userAgent,
    };

    // Send to Proto-SIR learner if available
    if (this.isProxyMode) {
      try {
        fetch(this.logEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(errorData),
        }).catch(() => {
          // Silent catch: if logging itself fails, don't create cascading errors
        });
      } catch (e) {
        // Silent fail
      }
    }

    return errorData;
  }

  /**
   * Categorize errors:
   * - CRITICAL: user-facing failures (rendering, UI)
   * - NON_CRITICAL: upstream data failures (API timeouts, 502s)
   */
  isCritical(error, context = {}) {
    // Check against patterns
    const msg = error?.message?.toLowerCase() || '';
    
    for (const pattern of this.criticalErrorPatterns) {
      if (msg.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    // Heuristics
    if (msg.includes('parsing') || msg.includes('syntax')) return true;
    if (msg.includes('cannot read') || msg.includes('cannot set')) return true;
    if (msg.includes('upstream') || msg.includes('502') || msg.includes('timeout')) return false;
    if (msg.includes('cors') && context.endpoint === 'upstream') return false;

    return false;
  }

  /**
   * Wrap async calls to data endpoints with error handling
   */
  async fetchWithLogging(fetchFn, context = {}) {
    try {
      return await fetchFn();
    } catch (error) {
      const isCritical = this.isCritical(error, context);

      await this.logError(error, {
        ...context,
        severity: isCritical ? 'critical' : 'non_critical',
      });

      // Only throw critical errors
      if (isCritical) {
        throw error;
      }

      // Return safe fallback for non-critical errors
      return context.fallback || null;
    }
  }

  /**
   * Global error listener setup
   */
  attachGlobalListeners() {
    window.addEventListener('error', (event) => {
      this.logError(event.error || new Error(event.message), {
        type: 'uncaught_error',
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });

      // Only suppress non-critical errors
      if (!this.isCritical(event.error)) {
        event.preventDefault();
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.logError(event.reason, {
        type: 'unhandled_rejection',
      });

      // Non-critical promise rejections are handled
      if (!this.isCritical(event.reason)) {
        event.preventDefault();
      }
    });
  }
}

// Export singleton instance
export const errorLogger = new ErrorLogger({
  isProxyMode: typeof IS_PROXY_MODE !== 'undefined' ? IS_PROXY_MODE : true,
  suppressConsoleErrors: true,
  criticalErrorPatterns: [
    'parsing',
    'cannot read',
    'cannot set',
    'invalid json',
  ],
});

// Attach global listeners on module load
errorLogger.attachGlobalListeners();
