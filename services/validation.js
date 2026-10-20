function dateKey(value) {
  const text = String(value ?? '').trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(text);
  let y, m, d;
  if (match) [, y, m, d] = match;
  else {
    match = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})(?:\s.*)?$/.exec(text);
    if (!match) return null;
    [, d, m, y] = match;
  }
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null;
  return date.toISOString().slice(0, 10);
}

function objectBody(req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) &&
      (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
    return res.status(400).json({ error: 'Se requiere un objeto JSON.' });
  }
  next();
}

module.exports = { dateKey, objectBody };
