/**
 * Shared client config. Exposes window.getAppConfig() which caches
 * /api/config so pages can decide whether write UI is available.
 */
(function () {
  let cached = null;
  let pending = null;

  function getAppConfig() {
    if (cached) return Promise.resolve(cached);
    if (pending) return pending;
    pending = fetch('/api/config')
      .then((res) => res.json())
      .then((cfg) => {
        cached = cfg;
        pending = null;
        return cfg;
      })
      .catch((err) => {
        pending = null;
        // Fail closed on the public site: hide write UI if config is unreachable.
        cached = { writable: false, syncEnabled: false, env: 'unknown' };
        return cached;
      });
    return pending;
  }

  window.getAppConfig = getAppConfig;
})();
