/**
 * 可观测性体系 (T-2)
 *
 * 集成 Sentry 错误监控 + 自定义性能追踪 + 结构化日志
 * Sentry SDK 通过 CDN 加载，DSN 通过 <meta> 标签或环境变量配置
 *
 * 配置方式：
 *   <meta name="tm-sentry-dsn" content="https://xxx@sentry.io/xxx" />
 *   <meta name="tm-env" content="production" />
 */
(function (w) {
  w.TM = w.TM || {};

  let _sentryAvailable = false;
  let _environment = 'development';
  let _dsn = '';

  const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
  let _logLevel = LOG_LEVELS.info;

  // ─── Sentry Integration ───────────────────────────────────

  function getSentryConfig() {
    try {
      const dsnMeta = w.document.querySelector('meta[name="tm-sentry-dsn"]');
      _dsn = dsnMeta?.getAttribute('content') || '';
      const envMeta = w.document.querySelector('meta[name="tm-env"]');
      _environment = envMeta?.getAttribute('content') || 'development';
    } catch {
      _dsn = '';
      _environment = 'development';
    }
    return { dsn: _dsn, environment: _environment };
  }

  async function initSentry() {
    const { dsn, environment } = getSentryConfig();
    if (!dsn || dsn === '__OFF__') {
      console.log('[Observability] Sentry DSN not configured, running without Sentry');
      return;
    }

    if (typeof w.Sentry !== 'undefined') {
      configureSentry(dsn, environment);
      return;
    }

    try {
      await loadScript('https://browser.sentry-cdn.com/8.40.0/bundle.min.js');
      if (typeof w.Sentry !== 'undefined') {
        configureSentry(dsn, environment);
      }
    } catch {
      console.warn('[Observability] Failed to load Sentry SDK');
    }
  }

  function configureSentry(dsn, environment) {
    try {
      w.Sentry.init({
        dsn,
        environment,
        release: 'talent-hub@1.0.0',
        tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        beforeSend(event) {
          if (event.user) {
            delete event.user.ip_address;
            delete event.user.email;
            delete event.user.username;
          }
          if (event.request) {
            delete event.request.cookies;
          }
          return event;
        },
        integrations: [
          w.Sentry.browserTracingIntegration?.() || null,
        ].filter(Boolean),
      });
      _sentryAvailable = true;
      console.log(`[Observability] Sentry initialized (${environment})`);
    } catch (err) {
      console.warn('[Observability] Sentry init failed:', err);
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = w.document.createElement('script');
      s.src = src;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = reject;
      w.document.head.appendChild(s);
    });
  }

  // ─── Error Capture ─────────────────────────────────────────

  function captureException(error, context) {
    const ctx = context || {};
    console.error('[Error]', error.message || error, ctx.module || '', ctx.action || '');

    if (_sentryAvailable && w.Sentry) {
      w.Sentry.withScope((scope) => {
        if (ctx.module) scope.setTag('module', ctx.module);
        if (ctx.action) scope.setTag('action', ctx.action);
        if (ctx.extra) scope.setExtras(ctx.extra);
        if (ctx.user) scope.setUser(ctx.user);
        w.Sentry.captureException(error);
      });
    }
  }

  function captureMessage(message, level, context) {
    if (_sentryAvailable && w.Sentry) {
      w.Sentry.withScope((scope) => {
        if (context?.module) scope.setTag('module', context.module);
        if (context?.extra) scope.setExtras(context.extra);
        w.Sentry.captureMessage(message, level || 'info');
      });
    }
  }

  // ─── User Context ──────────────────────────────────────────

  function setUser(user) {
    if (_sentryAvailable && w.Sentry) {
      w.Sentry.setUser(user ? {
        id: String(user.id || ''),
        role: user.role || '',
      } : null);
    }
  }

  // ─── Performance Tracking ──────────────────────────────────

  const _perfTimers = new Map();

  function startTimer(name) {
    _perfTimers.set(name, performance.now());
  }

  function endTimer(name, context) {
    const start = _perfTimers.get(name);
    if (start == null) return 0;
    const elapsed = performance.now() - start;
    _perfTimers.delete(name);

    if (_logLevel <= LOG_LEVELS.debug) {
      console.debug(`[Perf] ${name}: ${elapsed.toFixed(1)}ms`, context || '');
    }

    if (_sentryAvailable && w.Sentry && elapsed > 1000) {
      captureMessage(`Slow operation: ${name} (${elapsed.toFixed(0)}ms)`, 'warning', {
        module: 'performance',
        extra: { name, elapsed, ...context },
      });
    }

    return elapsed;
  }

  // ─── Structured Logging ───────────────────────────────────

  function log(level, module, message, data) {
    if (LOG_LEVELS[level] == null || LOG_LEVELS[level] < _logLevel) return;

    const timestamp = new Date().toISOString();
    const entry = { timestamp, level, module, message, ...data };

    switch (level) {
      case 'error':
        console.error(`[${module}]`, message, data || '');
        break;
      case 'warn':
        console.warn(`[${module}]`, message, data || '');
        break;
      case 'debug':
        console.debug(`[${module}]`, message, data || '');
        break;
      default:
        console.log(`[${module}]`, message, data || '');
    }

    return entry;
  }

  // ─── Vue Error Handler Integration ────────────────────────

  function installVueErrorHandler(app) {
    const original = app.config.errorHandler;
    app.config.errorHandler = function (err, vm, info) {
      captureException(err, {
        module: 'vue',
        action: info,
        extra: { componentName: vm?.$options?.name || 'Anonymous' },
      });
      if (typeof original === 'function') {
        original.call(this, err, vm, info);
      }
    };
  }

  // ─── Global Error Handlers ─────────────────────────────────

  function installGlobalHandlers() {
    w.addEventListener('error', (event) => {
      captureException(event.error || new Error(event.message), {
        module: 'global',
        extra: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    w.addEventListener('unhandledrejection', (event) => {
      captureException(event.reason || new Error('Unhandled Promise rejection'), {
        module: 'promise',
      });
    });
  }

  // ─── Public API ─────────────────────────────────────────────

  w.TM.observability = {
    init: initSentry,
    captureException,
    captureMessage,
    setUser,
    startTimer,
    endTimer,
    log,
    installVueErrorHandler,
    installGlobalHandlers,
    setLogLevel(level) {
      if (LOG_LEVELS[level] != null) _logLevel = LOG_LEVELS[level];
    },
    isSentryAvailable() { return _sentryAvailable; },
  };
})(window);
