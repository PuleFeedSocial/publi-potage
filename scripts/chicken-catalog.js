(function(root){
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const catalog=[['pollo-20','Pollo','20 kg'],['suprema-15','Supremas','15 kg'],['suprema-5','Supremas','5 kg'],['cuartos-15','Cuartos traseros','15 kg'],['cuartos-5','Cuartos traseros','5 kg'],['alas-15','Alas','15 kg'],['alas-5','Alas','5 kg']].map(([key,producto,presentacion])=>({key,producto,presentacion}));
 function key(row){
  if(!/pollo/.test(norm(row.categoria)))return null;
  const name=norm(row.producto),weights=[...norm(row.presentacion||row.producto).matchAll(/(\d+(?:[.,]\d+)?)\s*k(?:g|gs|ilo(?:s|gramos)?)\b/g)].map(m=>Number(m[1].replace(',','.')));
  if(weights.length!==1)return null;
  const base=/picad|medallon|bocadito|rellen/.test(name)?null:/cuartos?\s+traseros?/.test(name)?'cuartos':/supremas?/.test(name)?'suprema':/\balas?\b/.test(name)?'alas':/^pollo(?:\s|$)/.test(name)?'pollo':null;
  const result=base+'-'+weights[0];return catalog.some(c=>c.key===result)?result:null;
 }
 function rows(data,region){return catalog.map(c=>{const matches=(data.carnes||[]).filter(r=>r.region_id===region&&key(r)===c.key);return {...(matches.length===1?matches[0]:{region_id:region,categoria:'Pollos',precio:''}),producto:c.producto,presentacion:c.presentacion,_chickenKey:c.key,_missing:matches.length===0,_ambiguous:matches.length>1};});}
 function publish(data,region){
  if(!(data.regiones||[]).some(r=>r.region_id===region&&r.activa==='Sí'))throw Error('Seleccioná una región activa.');
  if((data.regionProductos||[]).some(r=>r.region_id===region&&r.tipo==='pollos'&&r.activo!=='Sí'))throw Error('Los pollos están desactivados en esta región.');
  const result=rows(data,region);
  for(const row of result)if(row._missing||row._ambiguous||typeof row.precio!=='number'||!Number.isFinite(row.precio)||row.precio<0||row.precio>1e10)throw Error('Completá o revisá '+row.producto+' x '+row.presentacion+' en Productos antes de generar la imagen.');
  return result;
 }
 const api={catalog,key,rows,publish};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ChickenCatalog=api;
})(typeof globalThis!=='undefined'?globalThis:this);
