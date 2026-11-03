let artworkData=null,artworkRegion='',artworkImage=null,artworkVersion=0,artworkReady=false,artworkLoadedAt='',artworkBranches=[],artworkPages=[],artworkDirectory=[],artworkCompanies=[],artworkCompany='';
const ae=id=>document.getElementById(id);
function currentArtworkCompany(){return CompanyTemplates.forCompany(artworkCompany||'Potage SRL');}
async function openPriceArtwork(){
 if(productsBusy)return;
 artworkRegion=pe('product-region').value;
 if(!artworkRegion){productStatus('Seleccioná una región para generar su imagen.',true);return;}
 ae('artwork-template').value=activeProductTypeFilter==='pollos'?'pollos':'costa';
 ae('artwork-dialog').showModal();await refreshPriceArtwork();
}
async function refreshPriceArtwork(){
 const version=++artworkVersion;artworkReady=false;artworkData=null;artworkBranches=[];artworkCompanies=[];artworkDirectory=[];
 ae('artwork-download').disabled=true;ae('artwork-refresh').disabled=true;ae('artwork-company').replaceChildren();ae('artwork-preview').hidden=true;ae('artwork-status').textContent='Consultando precios actuales…';ae('artwork-selections').replaceChildren();
 try{
  const [{status,body},directory]=await Promise.all([apiFetch('/api/productos',{signal:AbortSignal.timeout(20000)}),apiFetch('/api/productos/sucursales',{signal:AbortSignal.timeout(20000)})]);
  if(version!==artworkVersion)return;
  if(status!==200)throw Error(body.error||'No se pudieron actualizar los precios.');
  if(directory.status!==200)throw Error('No se pudieron actualizar las direcciones y contactos. Volvé a intentar.');
  artworkDirectory=directory.body.data||[];
  artworkCompanies=PriceArtwork.companies(body,artworkRegion,artworkDirectory);
  const select=ae('artwork-company'),previous=select.value||artworkCompany;
  select.replaceChildren();
  if(artworkCompanies.length)artworkCompanies.forEach(company=>select.add(new Option(company.name,company.empresa)));
  else select.add(new Option('Sin sucursales activas',''));
  if(previous&&artworkCompanies.some(company=>company.empresa===previous))select.value=previous;
  artworkCompany=select.value;
  artworkData=body;artworkLoadedAt=new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  const region=body.regiones.find(r=>r.region_id===artworkRegion);
  ae('artwork-region-name').textContent=region?.nombre_region||'Región no disponible';
  artworkBranches=PriceArtwork.branches(body,artworkRegion,artworkDirectory,artworkCompany||undefined);
  ae('artwork-refresh').disabled=false;
  buildArtworkSelections();
 }catch(error){if(version===artworkVersion)ae('artwork-status').textContent=error.name==='TimeoutError'?'La hoja tardó en responder. Pulsá Actualizar precios para reintentar.':error.message;}
 finally{if(version===artworkVersion)ae('artwork-refresh').disabled=false;}
}
function selectArtworkCompany(){
 if(!artworkData)return;
 artworkCompany=ae('artwork-company').value;
 try{
  artworkBranches=PriceArtwork.branches(artworkData,artworkRegion,artworkDirectory,artworkCompany||undefined);
  buildArtworkSelections();
 }catch(error){
  artworkVersion++;artworkReady=false;artworkPages=[];artworkImage=null;artworkBranches=[];
  ae('artwork-download').disabled=true;ae('artwork-preview').hidden=true;ae('artwork-page-picker').hidden=true;ae('artwork-selections').replaceChildren();ae('artwork-status').textContent=error.message;
 }
}
function buildArtworkSelections(){
 const company=currentArtworkCompany();
 const rule='Hasta 3 sedes: dirección y contacto. Más de 3: sede y teléfono.';
 ae('artwork-description').textContent=company.name+' · '+(ae('artwork-template').value==='pollos'?'Pollos: 7 presentaciones, sin mezclar con huevos. '+rule+' Formato vertical 4:5 · 1440 × 1800 px. Cada presentación mantiene su precio independiente.':'Elegí los huevos estándar que se publicarán; podés dejar filas sin producto. '+rule+' Formato vertical 4:5 · 1440 × 1800 px. Maple de 30 huevos · cajón de 12 maples.');
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
async function artworkOptionalAsset(paths){
 for(const path of paths||[]){
  try{return {image:await artworkAsset(path),path};}catch{}
 }
 return null;
}
async function renderSocialArtwork(kind,getRows){
 const version=++artworkVersion;artworkReady=false;artworkPages=[];artworkImage=null;ae('artwork-download').disabled=true;ae('artwork-preview').hidden=true;ae('artwork-page-picker').hidden=true;
 try{
  const rows=getRows();ae('artwork-status').textContent='Preparando imagen de alta resolución…';
  if(!artworkBranches.length)throw Error('No hay sucursales activas para esta empresa y región.');
  const company=currentArtworkCompany();
  const [logoAsset,sourceAsset,backgroundAsset]=await Promise.all([
   artworkOptionalAsset(company.assets.logo),
   artworkOptionalAsset(kind==='pollos'?company.assets.chicken:company.assets.eggs),
   artworkOptionalAsset(company.assets.background),
   document.fonts.ready
  ]);
  if(version!==artworkVersion)return;
  if(!sourceAsset)throw Error('No se encontró la imagen de '+(kind==='pollos'?'pollos':'huevos')+' de la plantilla.');
  artworkPages=SocialArtwork.render({
   canvasFactory:()=>document.createElement('canvas'),kind,branches:artworkBranches,rows,
   assets:{logo:logoAsset&&logoAsset.image,source:sourceAsset.image,sourceCustom:/^img\/plantillas\//.test(sourceAsset.path),background:backgroundAsset&&backgroundAsset.image},
   template:company
  });
  const select=ae('artwork-page');select.replaceChildren();artworkPages.forEach((_,i)=>select.add(new Option('Imagen '+(i+1)+' de '+artworkPages.length,String(i))));
  ae('artwork-page-picker').hidden=artworkPages.length<=1;artworkReady=true;showArtworkPage();
  const mode=(backgroundAsset?'Plantilla de ':'Diseño estándar · ')+company.name;
  ae('artwork-status').textContent=mode+' · PNG · '+SocialArtwork.FORMAT_LABEL+' · '+(artworkBranches.length>3?'Sedes y teléfonos.':'Sedes, direcciones y teléfonos.')+(artworkPages.length>1?' '+artworkPages.length+' imágenes: descargá cada una desde el selector.':'')+' Precios consultados a las '+artworkLoadedAt+'.';
 }catch(error){if(version===artworkVersion)ae('artwork-status').textContent=error.message||'No se pudo generar la imagen. Volvé a intentar.';}
}
function showArtworkPage(){
 const page=artworkPages[Number(ae('artwork-page').value)||0];if(!artworkReady||!page)return;
 const canvas=ae('artwork-preview');canvas.width=page.width;canvas.height=page.height;canvas.getContext('2d').drawImage(page,0,0);canvas.hidden=false;artworkImage=page;ae('artwork-download').disabled=false;
}
document.addEventListener('DOMContentLoaded',()=>{
 ae('product-artwork').onclick=openPriceArtwork;ae('artwork-template').onchange=buildArtworkSelections;ae('artwork-company').onchange=selectArtworkCompany;
 ae('artwork-refresh').onclick=refreshPriceArtwork;ae('artwork-page').onchange=showArtworkPage;
 ae('artwork-close').onclick=()=>ae('artwork-dialog').close();
 ae('artwork-dialog').addEventListener('close',()=>{artworkVersion++;artworkReady=false;});
 ae('artwork-download').onclick=async()=>{
  if(!artworkReady||!artworkImage)return;
  const region=artworkData.regiones.find(r=>r.region_id===artworkRegion);
  if(!region)return;
  const company=currentArtworkCompany(),kind=ae('artwork-template').value==='pollos'?'pollos':'huevos';
  const base='precios-'+company.slug+'-'+kind+'-'+String(region.nombre_region).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-')+'-'+new Date().toISOString().slice(0,10)+(artworkPages.length>1?'-'+(Number(ae('artwork-page').value)+1):'');
  if(artworkImage.width!==SocialArtwork.WIDTH||artworkImage.height!==SocialArtwork.HEIGHT){
   ae('artwork-status').textContent='La imagen no tiene el tamaño de exportación esperado. Pulsá Actualizar precios para regenerarla.';
   return;
  }
  ae('artwork-download').disabled=true;
  try{
   const blob=await new Promise((resolve,reject)=>artworkImage.toBlob(value=>value?resolve(value):reject(Error('No se pudo generar el PNG.')),'image/png'));
   const size=await SocialArtwork.verifyPngBlob(blob);
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download=base+'-'+size.width+'x'+size.height+'.png';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),30000);
   ae('artwork-status').textContent='PNG verificado: '+size.width+' × '+size.height+' px · Relación 4:5.';
  }catch(error){
   ae('artwork-status').textContent=error.message||'No se pudo descargar el PNG. Volvé a intentar.';
  }finally{ae('artwork-download').disabled=false;}
 };
});

async function renderChickenArtwork(){await renderSocialArtwork('pollos',()=>ChickenCatalog.publish(artworkData,artworkRegion));}
