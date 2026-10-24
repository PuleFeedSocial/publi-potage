(function (root) {
  const quantities = { precio_docena: 12, precio_maple: 30, precio_cajon: 360 };
  function calculate(source, value) {
    if (!Object.hasOwn(quantities, source)) throw new Error('Elegí docena, maple o cajón como precio base.');
    if (value === '') return Object.fromEntries(Object.keys(quantities).map(key => [key, '']));
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e10) throw new Error('Ingresá un precio válido.');
    const cents = Math.round(value * 100);
    if (Math.abs(cents - value * 100) > 0.001) throw new Error('Usá como máximo dos decimales.');
    const result = Object.fromEntries(Object.entries(quantities).map(([key, quantity]) => [key, Math.round(cents * quantity / quantities[source]) / 100]));
    if (Object.values(result).some(amount => amount > 1e10)) throw new Error('El precio calculado supera el importe máximo permitido.');
    return result;
  }
  const api = { calculate, fields: Object.keys(quantities) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EggPrices = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
