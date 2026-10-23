// Per-process protection. Deployments with multiple replicas need a shared store.
function rateLimit({ limit = 30, windowMs = 15 * 60 * 1000, keyFor = req => req.ip } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, item] of buckets) if (item.until <= now) buckets.delete(key);
    const key = keyFor(req);
    const item = buckets.get(key) || { count: 0, until: now + windowMs };
    item.count++;
    buckets.set(key, item);
    if (item.count > limit) {
      res.set('Retry-After', String(Math.ceil((item.until - now) / 1000)));
      return res.status(429).json({ error: 'Demasiados intentos. Esperá unos minutos y volvé a intentar.' });
    }
    next();
  };
}
module.exports = rateLimit;
