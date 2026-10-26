(function(root){
 const normal=value=>String(value||'').trim().toUpperCase().replace(/\s+/g,'');
 const templates={amba:{name:'AMBA · Beige',image:'img/precios/amba.jpg',defaults:['B1','B2','B3']},costa:{name:'Costa · Amarilla',image:'img/precios/costa.jpg',defaults:['B1','B2','B3','C1','C2','C3']}};
 function candidates(data,id){return (data.huevos||[]).filter(r=>r.region_id===id&&normal(r.lista_id)==='GENERAL'&&r.categoria==='Estándar');}
 function rows(data,id,keys){
  const region=(data.regiones||[]).find(r=>r.region_id===id);
  if(!region||region.activa!=='Sí')throw Error('Seleccioná una región activa.');
  if((data.regionProductos||[]).some(r=>r.region_id===id&&r.tipo==='huevos'&&r.activo!=='Sí'))throw Error('Los huevos están desactivados en esta región.');
  if(keys.some(k=>!k))throw Error('Seleccioná un producto para cada fila.');
  if(new Set(keys.map(normal)).size!==keys.length)throw Error('No repitas un producto en varias filas.');
  return keys.map(key=>{
   const matches=candidates(data,id).filter(r=>r.tipo_huevo===key);
   if(matches.length!==1)throw Error('Un producto seleccionado ya no está disponible.');
   const row=matches[0];
   if(![row.precio_maple,row.precio_cajon].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e10))throw Error('Faltan precios válidos en '+row.tipo_huevo+'. Completalos en Productos.');
   if(Math.abs(row.precio_cajon-row.precio_maple*12)>0.061)throw Error('Revisá los precios de '+row.tipo_huevo+': el cajón debe equivaler a 12 maples.');
   return row;
  });
 }
 const api={templates,candidates,rows,normal};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PriceArtwork=api;
})(typeof globalThis!=='undefined'?globalThis:this);
