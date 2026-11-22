(function (root) {
  const fields = ['precio_docena','precio_maple','precio_cajon','precio_pallet'];
  function calculate(source, value, category='Estándar') {
    const special=category==='Especial';
    const quantities = special ? { precio_maple:20, precio_cajon:240 } : { precio_docena:12, precio_maple:30, precio_cajon:360, precio_pallet:9000 };
    if (!Object.hasOwn(quantities, source)) throw new Error('Elegí docena, maple, cajón o pallet como precio base.');
    if (value === '') return Object.fromEntries(fields.map(key => [key, '']));
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e10) throw new Error('Ingresá un precio válido.');
    const cents = Math.round(value * 100);
    if (Math.abs(cents - value * 100) > 0.001) throw new Error('Usá como máximo dos decimales.');
    if(source==='precio_pallet'&&cents%25!==0)throw new Error('El precio del pallet debe ser múltiplo de $0,25 para obtener un precio por cajón con dos decimales.');
    const result = Object.fromEntries(Object.entries(quantities).map(([key, quantity]) => [key, Math.round(cents * quantity / quantities[source]) / 100]));
    if(special) {result.precio_docena='';result.precio_pallet='';}else if(source!=='precio_pallet')result.precio_pallet=Math.round(result.precio_cajon*2500)/100;
    if (Object.values(result).some(amount => amount > 1e10)) throw new Error('El precio calculado supera el importe máximo permitido.');
    return result;
  }
  const api = { calculate, fields };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EggPrices = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
