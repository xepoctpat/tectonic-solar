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
    this.dedupeWindowMs = options.dedupeWindowMs || (15 * 60 * 1000);
    this.recentNonCriticalEvents = new Map();
  }

  buildNonCriticalKey(errorData = {}) {
    return [
      errorData.severity || 'unknown',
      errorData.type || 'unknown',
      errorData.endpoint || 'no-endpoint',
      errorData.description || 'no-description',
      errorData.message || 'no-message',
    ].join('::');
  }

  dedupeNonCriticalError(errorData = {}) {
    if (errorData.severity === 'critical') {
      return { suppress: false, suppressedCount: 0 };
    }

    if (errorData.severity !== 'non_critical' && errorData.type !== 'upstream_failure') {
      return { suppress: false, suppressedCount: 0 };
    }

    const key = this.buildNonCriticalKey(errorData);
    const now = Date.now();
    const existing = this.recentNonCriticalEvents.get(key);

    if (existing && now - existing.lastLoggedAt < this.dedupeWindowMs) {
      existing.suppressedCount += 1;
      return {
        suppress: true,
        suppressedCount: existing.suppressedCount,
      };
    }

    const suppressedCount = existing?.suppressedCount || 0;
    this.recentNonCriticalEvents.set(key, {
      lastLoggedAt: now,
      suppressedCount: 0,
    });

    const cutoff = now - (this.dedupeWindowMs * 2);
    for (const [entryKey, entry] of this.recentNonCriticalEvents.entries()) {
      if (entry.lastLoggedAt < cutoff) {
        this.recentNonCriticalEvents.delete(entryKey);
      }
    }

    return { suppress: false, suppressedCount };
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

    const dedupe = this.dedupeNonCriticalError(errorData);
    if (dedupe.suppress) {
      return {
        ...errorData,
        suppressedDuplicate: true,
        suppressedCount: dedupe.suppressedCount,
      };
    }

    if (dedupe.suppressedCount > 0) {
      errorData.suppressedDuplicates = dedupe.suppressedCount;
    }

    // Send to Proto-SIR learner if available
    if (this.isProxyMode) {
      try {
        fetch(this.logEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
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
  dedupeWindowMs: 15 * 60 * 1000,
  criticalErrorPatterns: [
    'parsing',
    'cannot read',
    'cannot set',
    'invalid json',
  ],
});

// Attach global listeners on module load
errorLogger.attachGlobalListeners();
