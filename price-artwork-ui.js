let artworkData=null,artworkRegion='',artworkImage=null,artworkVersion=0,artworkReady=false,artworkLoadedAt='';
const ae=id=>document.getElementById(id);
async function openPriceArtwork(){
 if(productsBusy)return;
 artworkRegion=pe('product-region').value;
 if(!artworkRegion){productStatus('Seleccioná una región para generar su imagen.',true);return;}
 const name=productText(productsData?.regiones.find(r=>r.region_id===artworkRegion)?.nombre_region);
 ae('artwork-template').value=name.includes('amba')?'amba':name.includes('costa')?'costa':'';
 ae('artwork-dialog').showModal();await refreshPriceArtwork();
}
async function refreshPriceArtwork(){
 const version=++artworkVersion;artworkReady=false;artworkData=null;
 ae('artwork-download').disabled=true;ae('artwork-refresh').disabled=true;ae('artwork-preview').hidden=true;ae('artwork-status').textContent='Consultando precios actuales…';ae('artwork-selections').replaceChildren();
 try{
  const {status,body}=await apiFetch('/api/productos',{signal:AbortSignal.timeout(20000)});
  if(version!==artworkVersion)return;
  if(status!==200)throw Error(body.error||'No se pudieron actualizar los precios.');
  artworkData=body;artworkLoadedAt=new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  const region=body.regiones.find(r=>r.region_id===artworkRegion);
  ae('artwork-region-name').textContent=region?.nombre_region||'Región no disponible';
  ae('artwork-refresh').disabled=false;
  buildArtworkSelections();
 }catch(error){if(version===artworkVersion)ae('artwork-status').textContent=error.name==='TimeoutError'?'La hoja tardó en responder. Pulsá Actualizar precios para reintentar.':error.message;}
 finally{if(version===artworkVersion)ae('artwork-refresh').disabled=false;}
}
function buildArtworkSelections(){
 const template=PriceArtwork.templates[ae('artwork-template').value],root=ae('artwork-selections');root.replaceChildren();
 if(!template||!artworkData){artworkReady=false;ae('artwork-preview').hidden=true;ae('artwork-download').disabled=true;ae('artwork-status').textContent='Elegí una plantilla para esta región.';return;}
 const options=PriceArtwork.candidates(artworkData,artworkRegion);
 template.defaults.forEach((key,index)=>{
  const box=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select');
  label.htmlFor='artwork-row-'+index;label.className='form-label';label.textContent=(index<3?'Blancos':'Colorados')+' · fila '+(index%3+1);
  select.id=label.htmlFor;select.className='form-select custom-input';select.append(new Option('Seleccionar producto',''));
  options.forEach(r=>select.append(new Option(r.tipo_huevo,r.tipo_huevo)));
  const matches=options.filter(r=>PriceArtwork.normal(r.tipo_huevo)===key);if(matches.length===1)select.value=matches[0].tipo_huevo;
  select.onchange=renderPriceArtwork;box.append(label,select);root.append(box);
 });
 renderPriceArtwork();
}
async function renderPriceArtwork(){
 const version=++artworkVersion;artworkReady=false;ae('artwork-download').disabled=true;ae('artwork-preview').hidden=true;
 const templateKey=ae('artwork-template').value,template=PriceArtwork.templates[templateKey];if(!template||!artworkData)return;
 const keys=Array.from(ae('artwork-selections').querySelectorAll('select')).map(el=>el.value);
 let selected,error='';try{selected=PriceArtwork.rows(artworkData,artworkRegion,keys);}catch(e){error=e.message;selected=keys.map(key=>PriceArtwork.candidates(artworkData,artworkRegion).find(r=>r.tipo_huevo===key));}
 ae('artwork-status').textContent='Preparando vista previa…';
 try{
  const img=new Image();img.src=template.image;await img.decode();if(version!==artworkVersion)return;
  const canvas=ae('artwork-preview');canvas.width=1880;canvas.height=1576;const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.drawImage(img,0,0,940,788);
  const columns=templateKey==='amba'?[[172,182],[374,182],[587,182]]:[[40,126],[181,126],[322,137],[496,126],[637,126],[778,137]];
  const ys=templateKey==='amba'?[417,482,547]:[415,488,560];const height=templateKey==='amba'?50:58;
  const money=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?'$'+value.toLocaleString('es-AR',{maximumFractionDigits:2}):'—';
  selected.forEach((row,index)=>{
   const group=templateKey==='costa'&&index>=3?3:0,y=ys[index%3];
   const texts=[row?.tipo_huevo||'—',money(row?.precio_maple),money(row?.precio_cajon)];
   for(let column=0;column<3;column++){
    const [x,width]=columns[group+column];
    // Preserve the supplied artwork; replace only the variable cell interiors at render time.
    const pixel=ctx.getImageData(Math.round((x+width/2)*2),Math.round((y+5)*2),1,1).data;
    ctx.fillStyle='rgb('+pixel[0]+','+pixel[1]+','+pixel[2]+')';ctx.fillRect(x+8,y+6,width-16,height-12);
    ctx.fillStyle='#38240e';ctx.textAlign='center';ctx.textBaseline='middle';let size=24;ctx.font='700 '+size+'px Arial';
    while(ctx.measureText(texts[column]).width>width-18&&size>9){size--;ctx.font='700 '+size+'px Arial';}
    ctx.fillText(texts[column],x+width/2,y+height/2+1);
   }
  });
  canvas.hidden=false;artworkImage=canvas;artworkReady=!error;ae('artwork-download').disabled=!artworkReady;
  ae('artwork-status').textContent=error||'Lista para descargar · Precios consultados a las '+artworkLoadedAt+'.';
 }catch(e){if(version===artworkVersion)ae('artwork-status').textContent='No se pudo cargar la plantilla. Volvé a intentar.';}
}
document.addEventListener('DOMContentLoaded',()=>{
 ae('product-artwork').onclick=openPriceArtwork;ae('artwork-template').onchange=buildArtworkSelections;
 ae('artwork-refresh').onclick=refreshPriceArtwork;
 ae('artwork-close').onclick=()=>ae('artwork-dialog').close();
 ae('artwork-dialog').addEventListener('close',()=>{artworkVersion++;artworkReady=false;});
 ae('artwork-download').onclick=()=>{
  if(!artworkReady||!artworkImage)return;
  const region=artworkData.regiones.find(r=>r.region_id===artworkRegion);
  const name='precios-'+String(region.nombre_region).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-')+'-'+new Date().toISOString().slice(0,10)+'.png';
  artworkImage.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},'image/png');
 };
});
