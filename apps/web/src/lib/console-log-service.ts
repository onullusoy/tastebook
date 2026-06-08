class ConsoleLogService {
  private originalError: ((...data: any[]) => void) | null = null;
  private originalWarn: ((...data: any[]) => void) | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.originalError = window.console.error;
      this.originalWarn = window.console.warn;
      this.init();
    }
  }

  private init() {
    const suppressPatterns = [
      /disconnected port/i,
      /Attempting to use a disconnected port object/i,
      /denied permission/i,
      /overlay\.background/i,
      /background\.js/i,
    ];

    const shouldSuppress = (args: any[]) => {
      return args.some((arg) => {
        if (!arg) return false;
        if (typeof arg === "string") {
          return suppressPatterns.some((pattern) => pattern.test(arg));
        }
        if (typeof arg === "object") {
          const message = arg.message || arg.stack || "";
          const filename = arg.filename || "";
          return (
            suppressPatterns.some((pattern) => pattern.test(message)) ||
            suppressPatterns.some((pattern) => pattern.test(filename))
          );
        }
        return false;
      });
    };

    // 1. Intercept console.error
    window.console.error = (...args: any[]) => {
      if (shouldSuppress(args)) {
        return;
      }
      if (this.originalError) {
        this.originalError.apply(window.console, args);
      }
    };

    // 2. Intercept console.warn
    window.console.warn = (...args: any[]) => {
      if (shouldSuppress(args)) {
        return;
      }
      if (this.originalWarn) {
        this.originalWarn.apply(window.console, args);
      }
    };

    // 3. Intercept window.onerror
    const originalOnError = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      const msgStr = typeof message === "string" ? message : message?.toString() || "";
      const srcStr = source || "";
      const errStr = error?.message || error?.stack || "";
      
      if (
        shouldSuppress([msgStr, srcStr, errStr, error])
      ) {
        return true; // Prevents browser error logging & overlay trigger
      }
      if (originalOnError) {
        return originalOnError(message, source, lineno, colno, error);
      }
      return false;
    };

    // 4. Intercept 'error' event listeners (e.g. browser extensions)
    window.addEventListener(
      "error",
      (event) => {
        const msg = event.message || "";
        const filename = event.filename || "";
        const errMessage = event.error?.message || event.error?.stack || "";
        
        if (shouldSuppress([msg, filename, errMessage, event.error])) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      },
      { capture: true }
    );

    // 5. Intercept unhandled promise rejections
    window.addEventListener(
      "unhandledrejection",
      (event) => {
        const reason = event.reason;
        const msg = reason?.message || reason?.stack || String(reason || "");
        
        if (shouldSuppress([msg, reason])) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      },
      { capture: true }
    );
  }
}

export const consoleLogService = typeof window !== "undefined" ? new ConsoleLogService() : null;
