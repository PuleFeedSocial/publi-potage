let artworkData=null,artworkRegion='',artworkImage=null,artworkVersion=0,artworkReady=false,artworkLoadedAt='',artworkBranches=[],artworkPages=[];
const ae=id=>document.getElementById(id);
async function openPriceArtwork(){
 if(productsBusy)return;
 artworkRegion=pe('product-region').value;
 if(!artworkRegion){productStatus('Seleccioná una región para generar su imagen.',true);return;}
 ae('artwork-template').value=activeProductTypeFilter==='pollos'?'pollos':'costa';
 ae('artwork-dialog').showModal();await refreshPriceArtwork();
}
async function refreshPriceArtwork(){
 const version=++artworkVersion;artworkReady=false;artworkData=null;artworkBranches=[];
 ae('artwork-download').disabled=true;ae('artwork-refresh').disabled=true;ae('artwork-preview').hidden=true;ae('artwork-status').textContent='Consultando precios actuales…';ae('artwork-selections').replaceChildren();
 try{
  const [{status,body},directory]=await Promise.all([apiFetch('/api/productos',{signal:AbortSignal.timeout(20000)}),apiFetch('/api/productos/sucursales',{signal:AbortSignal.timeout(20000)})]);
  if(version!==artworkVersion)return;
  if(status!==200)throw Error(body.error||'No se pudieron actualizar los precios.');
  if(directory.status!==200)throw Error('No se pudieron actualizar las direcciones y contactos. Volvé a intentar.');
  artworkBranches=PriceArtwork.branches(body,artworkRegion,directory.body.data||[]);
  artworkData=body;artworkLoadedAt=new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  const region=body.regiones.find(r=>r.region_id===artworkRegion);
  ae('artwork-region-name').textContent=region?.nombre_region||'Región no disponible';
  ae('artwork-refresh').disabled=false;
  buildArtworkSelections();
 }catch(error){if(version===artworkVersion)ae('artwork-status').textContent=error.name==='TimeoutError'?'La hoja tardó en responder. Pulsá Actualizar precios para reintentar.':error.message;}
 finally{if(version===artworkVersion)ae('artwork-refresh').disabled=false;}
}
function buildArtworkSelections(){
 ae('artwork-description').textContent=ae('artwork-template').value==='pollos'?'Pollos: 7 presentaciones, sin mezclar con huevos. Hasta 3 sedes: dirección y contacto. Más de 3: sede y teléfono. Formato Facebook 4:5. Cada presentación mantiene su precio independiente.':'Elegí los huevos estándar que se publicarán; podés dejar filas sin producto. Hasta 3 sedes: dirección y contacto. Más de 3: sede y teléfono. Formato Facebook 4:5. Maple de 30 huevos · cajón de 12 maples.';
 artworkVersion++;artworkReady=false;ae('artwork-download').disabled=true;
 if(ae('artwork-template').value==='pollos'){ae('artwork-selections').replaceChildren();renderChickenArtwork();return;}
 const template=PriceArtwork.templates[ae('artwork-template').value],root=ae('artwork-selections');root.replaceChildren();
 if(!template||!artworkData){artworkReady=false;ae('artwork-preview').hidden=true;ae('artwork-download').disabled=true;ae('artwork-status').textContent='Elegí una plantilla para esta región.';return;}
 const options=PriceArtwork.candidates(artworkData,artworkRegion);
 template.defaults.forEach((key,index)=>{
  const box=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select');
  label.htmlFor='artwork-row-'+index;label.className='form-label';label.textContent=(index<3?'Blancos':'Colorados')+' · fila '+(index%3+1);
  select.id=label.htmlFor;select.className='form-select custom-input';select.append(new Option('No mostrar producto',''));
  options.forEach(r=>select.append(new Option(r.tipo_huevo,r.tipo_huevo)));
  const matches=options.filter(r=>PriceArtwork.normal(r.tipo_huevo)===key);if(matches.length===1)select.value=matches[0].tipo_huevo;
  select.onchange=renderPriceArtwork;box.append(label,select);root.append(box);
 });
 renderPriceArtwork();
}
async function renderPriceArtwork(){
 const keys=Array.from(ae('artwork-selections').querySelectorAll('select')).map(el=>el.value);
 await renderSocialArtwork('huevos',()=>PriceArtwork.rows(artworkData,artworkRegion,keys,{allowEmpty:true}));
}
const artworkAssetCache=new Map();
function artworkAsset(path){if(!artworkAssetCache.has(path)){const promise=(async()=>{const img=new Image();img.src=path;await img.decode();return img;})();artworkAssetCache.set(path,promise);promise.catch(()=>artworkAssetCache.delete(path));}return artworkAssetCache.get(path);}
async function renderSocialArtwork(kind,getRows){
 const version=++artworkVersion;artworkReady=false;artworkPages=[];ae('artwork-download').disabled=true;ae('artwork-preview').hidden=true;ae('artwork-page-picker').hidden=true;
 try{
  const rows=getRows();ae('artwork-status').textContent='Preparando imagen de alta resolución…';
  const [logo,source]=await Promise.all([artworkAsset('img/icon-512.png'),artworkAsset(kind==='pollos'?'img/precios/pollos.png':'img/precios/costa.jpg'),document.fonts.ready]);
  if(version!==artworkVersion)return;
  const region=artworkData.regiones.find(r=>r.region_id===artworkRegion);
  artworkPages=SocialArtwork.render({canvasFactory:()=>document.createElement('canvas'),kind,region:region.nombre_region,branches:artworkBranches,rows,assets:{logo,source}});
  const select=ae('artwork-page');select.replaceChildren();artworkPages.forEach((_,i)=>select.add(new Option('Imagen '+(i+1)+' de '+artworkPages.length,String(i))));
  ae('artwork-page-picker').hidden=artworkPages.length<=1;artworkReady=true;showArtworkPage();
  ae('artwork-status').textContent='PNG · 2160 × 2700 px · Formato 4:5 · '+(artworkBranches.length>3?'Sedes y teléfonos.':'Sedes, direcciones y teléfonos.')+(artworkPages.length>1?' '+artworkPages.length+' imágenes: descargá cada una desde el selector.':'')+' Precios consultados a las '+artworkLoadedAt+'.';
 }catch(error){if(version===artworkVersion)ae('artwork-status').textContent=error.message||'No se pudo generar la imagen. Volvé a intentar.';}
}
function showArtworkPage(){
 const page=artworkPages[Number(ae('artwork-page').value)||0];if(!artworkReady||!page)return;
 const canvas=ae('artwork-preview');canvas.width=page.width;canvas.height=page.height;canvas.getContext('2d').drawImage(page,0,0);canvas.hidden=false;artworkImage=page;ae('artwork-download').disabled=false;
}
document.addEventListener('DOMContentLoaded',()=>{
 ae('product-artwork').onclick=openPriceArtwork;ae('artwork-template').onchange=buildArtworkSelections;
 ae('artwork-refresh').onclick=refreshPriceArtwork;ae('artwork-page').onchange=showArtworkPage;
 ae('artwork-close').onclick=()=>ae('artwork-dialog').close();
 ae('artwork-dialog').addEventListener('close',()=>{artworkVersion++;artworkReady=false;});
 ae('artwork-download').onclick=()=>{
  if(!artworkReady||!artworkImage)return;
  const region=artworkData.regiones.find(r=>r.region_id===artworkRegion);
  const name='precios-'+(ae('artwork-template').value==='pollos'?'pollos-':'huevos-')+String(region.nombre_region).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-')+'-'+new Date().toISOString().slice(0,10)+(artworkPages.length>1?'-'+(Number(ae('artwork-page').value)+1):'')+'.png';
  artworkImage.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},'image/png');
 };
});

async function renderChickenArtwork(){await renderSocialArtwork('pollos',()=>ChickenCatalog.publish(artworkData,artworkRegion));}
