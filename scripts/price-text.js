(function(root){
 const chicken=typeof module!=='undefined'&&module.exports?require('./chicken-catalog'):root.ChickenCatalog;
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const blank=v=>v==null||v==='';
 function money(v){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e10)throw Error('Hay precios inválidos. Revisalos antes de publicar.');return '$'+v.toLocaleString('es-AR',{maximumFractionDigits:2});}
 function build(data,directory,{region,branch='',search='',type='all',order='asc'}){
  const r=(data.regiones||[]).find(r=>r.region_id===region);
  if(!r||r.activa!=='Sí')throw Error('Seleccioná una región activa.');
  const enabled=t=>!(data.regionProductos||[]).some(c=>c.region_id===region&&c.tipo===t&&c.activo!=='Sí')&&(type==='all'||type===t);
  const match=row=>row.region_id===region&&norm(row.tipo_huevo||row.producto).includes(norm(search));
  const sort=(a,b)=>(order==='desc'?-1:1)*String(a.tipo_huevo||a.producto).localeCompare(String(b.tipo_huevo||b.producto),'es',{numeric:true,sensitivity:'base'});
  const blocks=[];let omitted=0;
  if(enabled('huevos'))for(const egg of (data.huevos||[]).filter(e=>match(e)&&norm(e.lista_id)==='general').sort(sort)){
   if(blank(egg.precio_maple)&&blank(egg.precio_cajon)){omitted++;continue;}
   const maple=money(egg.precio_maple),crate=money(egg.precio_cajon);
   if(Math.abs(egg.precio_cajon-egg.precio_maple*12)>0.061)throw Error('Revisá '+egg.tipo_huevo+': el cajón debe equivaler a 12 maples.');
   const units=egg.categoria==='Especial'?20:30;
   const code=String(egg.tipo_huevo).trim();
   const color=/^B(?:\d|\s|$)|^blanco/i.test(code)?' (Blancos)':/^C(?:\d|\s|$)|^color/i.test(code)?' (Colorados)':'';
   blocks.push(`🥚 Huevos ${code}${color}\n🔸 Maple (${units} unidades): ${maple}\n🔸 Cajón (12 maples): ${crate}`);
  }
  for(const category of ['pollos','cerdos','carnes'])if(enabled(category))for(const item of (category==='pollos'?chicken.rows(data,region).filter(r=>!r._missing):(data.carnes||[])).filter(row=>match(row)&&(/pollo/.test(norm(row.categoria))?'pollos':/cerdo|porcino/.test(norm(row.categoria))?'cerdos':'carnes')===category).sort(sort)){
   if(item._ambiguous)throw Error('Hay presentaciones de pollo duplicadas. Revisá la hoja antes de publicar.');
   if(blank(item.precio)){omitted++;continue;}
   blocks.push(`${category==='pollos'?'🍗':category==='cerdos'?'🐷':'🥩'} ${item.producto}\n🔸 ${item.presentacion||'Precio'}: ${money(item.precio)}`);
  }
  if(!blocks.length)throw Error('No hay productos con precios cargados para estos filtros.');
  const links=(data.locales||[]).filter(l=>l.region_id===region&&(!branch||l.local_id===branch));
  if(!links.length)throw Error('La sucursal seleccionada no pertenece a esta región o no hay sucursales vinculadas. Revisá Regiones.');
  const branches=links.map(l=>{const matches=directory.filter(b=>b.id===l.local_id);if(matches.length!==1)throw Error('Revisá el vínculo de '+l.nombre_local+' en Regiones.');return matches[0];}).filter(b=>b.activo!==false).sort((a,b)=>a.ubicacion.localeCompare(b.ubicacion,'es'));
  if(!branches.length)throw Error('No hay sucursales activas para publicar con estos filtros.');
  for(const b of branches)if(!b.direccion?.trim()||!b.contacto?.trim()||!b.horario?.trim())throw Error('Completá dirección, contacto y horario de '+b.ubicacion+' en Sucursales.');
  const details=branches.map(b=>`📍 ${branch?'Sucursal':'Sede'} ${b.ubicacion}\n🗺️ Dirección: ${b.direccion}\n⏰ Horarios: ${b.horario}\n📱 WhatsApp: ${b.contacto}`);
  return {text:['🛒 NUESTROS PRECIOS MAYORISTAS Y MINORISTAS:',...blocks,'⚠️ (Sujeto a disponibilidad de stock)',branch?'👇 ¡Vení a visitarnos! Te esperamos en nuestra sucursal: 👇':'👇 ¡Vení a visitarnos! Te esperamos en nuestras sucursales: 👇',...details,'🚚 ¡Acercate a tu punto de venta más cercano o mandanos un mensajito para consultar stock! Tu consulta no molesta. 💛'].join('\n\n'),omitted,regionName:r.nombre_region};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={build};else root.PriceText={build};
})(typeof globalThis!=='undefined'?globalThis:this);

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id);let version=0;
 el('price-text-close').onclick=()=>el('price-text-dialog').close();
 el('price-text-dialog').addEventListener('close',()=>{version++;});
 el('product-copy-text').onclick=async()=>{
  if(productsBusy)return;
  const filters={region:pe('product-region').value,branch:pe('product-local').value,search:pe('product-search').value,type:activeProductTypeFilter,order:pe('product-order').value};
  if(requestedBranch&&requestedBranch!==filters.branch){productStatus('Seleccioná una sucursal vinculada a la región.',true);return;}
  const request=++version;el('price-text-content').value='';el('price-text-copy').disabled=true;el('price-text-status').textContent='Actualizando precios y datos de las sucursales…';el('price-text-dialog').showModal();
  try{
   const [prices,branches]=await Promise.all([apiFetch('/api/productos',{signal:AbortSignal.timeout(20000)}),apiFetch('/api/productos/sucursales',{signal:AbortSignal.timeout(20000)})]);
   if(request!==version)return;
   if(prices.status!==200||branches.status!==200)throw Error('No se pudieron actualizar los datos. Cerrá y volvé a intentar.');
   const result=PriceText.build(prices.body,branches.body.data||[],filters);
   el('price-text-content').value=result.text;el('price-text-copy').disabled=false;
   el('price-text-status').textContent='Región '+result.regionName+' · Se aplicaron los filtros actuales.'+(result.omitted?' Se omitieron '+result.omitted+' productos sin precios cargados.':'');
  }catch(error){if(request===version)el('price-text-status').textContent=error.name==='TimeoutError'?'La consulta tardó demasiado. Cerrá y volvé a intentar.':error.message;}
 };
 el('price-text-copy').onclick=async()=>{
  const area=el('price-text-content');if(!area.value)return;
  try{await navigator.clipboard.writeText(area.value);el('price-text-status').textContent='Texto copiado. Ya podés pegarlo en tu publicación.';}
  catch{area.focus();area.select();el('price-text-status').textContent='El navegador no permitió copiar. El texto está seleccionado: usá Copiar o Ctrl+C.';}
 };
});
