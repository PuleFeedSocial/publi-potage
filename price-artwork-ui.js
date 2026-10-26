let artworkData=null,artworkRegion='',artworkImage=null,artworkVersion=0,artworkReady=false,artworkLoadedAt='',artworkBranches=[];
const ae=id=>document.getElementById(id);
function artworkFooter(ctx,region,branches){
 const lines=[];let y=660;
 function add(text,font,lineHeight){
  ctx.font=font;let line='';
  for(const word of String(text).trim().split(/\s+/)){
   const candidate=line?line+' '+word:word;
   if(ctx.measureText(candidate).width<=580){line=candidate;continue;}
   if(line){lines.push({text:line,font,y});y+=lineHeight;line='';}
   for(const char of word){if(ctx.measureText(line+char).width>580){lines.push({text:line,font,y});y+=lineHeight;line='';}line+=char;}
  }
  if(line){lines.push({text:line,font,y});y+=lineHeight;}
 }
 add(region,'700 25px Arial',30);y+=12;
 for(const branch of branches){add(branch.ubicacion,'700 20px Arial',25);add(branch.direccion,'18px Arial',23);add('Contacto: '+branch.contacto,'18px Arial',23);y+=14;}
 const height=Math.max(788,y+20);
 if(height>8000)throw Error('La región tiene demasiados datos para una sola imagen.');
 return {lines,height};
}
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
 ae('artwork-description').textContent=ae('artwork-template').value==='pollos'?'Pollos: 7 presentaciones, sin mezclar con huevos. Incluye dirección y contacto de las sucursales activas de la región. Cada presentación mantiene su precio independiente.':'Elegí los huevos estándar que se publicarán; podés dejar filas sin producto. Incluye dirección y contacto de las sucursales activas de la región. Maple de 30 huevos · cajón de 12 maples.';
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
 const version=++artworkVersion;artworkReady=false;ae('artwork-download').disabled=true;ae('artwork-preview').hidden=true;
 const templateKey=ae('artwork-template').value,template=PriceArtwork.templates[templateKey];if(!template||!artworkData)return;
 const keys=Array.from(ae('artwork-selections').querySelectorAll('select')).map(el=>el.value);
 let selected,error='';try{selected=PriceArtwork.rows(artworkData,artworkRegion,keys,{allowEmpty:true});}catch(e){error=e.message;selected=keys.map(key=>PriceArtwork.candidates(artworkData,artworkRegion).find(r=>r.tipo_huevo===key));}
 ae('artwork-status').textContent='Preparando vista previa…';
 try{
  const img=new Image();img.src=template.image;await img.decode();if(version!==artworkVersion)return;
  const canvas=ae('artwork-preview');canvas.width=1880;canvas.height=1576;let ctx=canvas.getContext('2d');
  const footer=artworkFooter(ctx,artworkData.regiones.find(r=>r.region_id===artworkRegion).nombre_region,artworkBranches);
  canvas.height=footer.height*2;ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.drawImage(img,0,0,940,788);
  // Remove the complete original footer, including the fixed Alfonsín address.
  const yellow=ctx.getImageData(10,1280,1,1).data;ctx.fillStyle='rgb('+yellow[0]+','+yellow[1]+','+yellow[2]+')';ctx.fillRect(0,640,940,footer.height-640);
  ctx.drawImage(img,600,650,325,125,650,660,260,100);
  ctx.textAlign='left';ctx.textBaseline='top';
  for(const line of footer.lines){ctx.font=line.font;ctx.fillStyle='#a84219';ctx.fillText(line.text,30,line.y);}
  const columns=templateKey==='amba'?[[172,182],[374,182],[587,182]]:[[40,126],[181,126],[322,137],[496,126],[637,126],[778,137]];
  const ys=templateKey==='amba'?[417,482,547]:[415,488,560];const height=templateKey==='amba'?50:58;
  const money=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?'$'+value.toLocaleString('es-AR',{maximumFractionDigits:2}):'—';
  selected.forEach((row,index)=>{
   const group=templateKey==='costa'&&index>=3?3:0,y=ys[index%3];
   const texts=[row?.tipo_huevo||'—',money(row?.precio_maple),money(row?.precio_cajon)];
   for(let column=0;column<3;column++){
    const [x,width]=columns[group+column];
    // Preserve the supplied artwork; replace only the variable cell interiors at render time.
    const pixel=ctx.getImageData(Math.round((x+30)*2),Math.round((y+12)*2),1,1).data;
    const inset=templateKey==='amba'?28:8;
    ctx.fillStyle='rgb('+pixel[0]+','+pixel[1]+','+pixel[2]+')';ctx.fillRect(x+inset,y+8,width-inset*2,height-16);
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
  const name='precios-'+(ae('artwork-template').value==='pollos'?'pollos-':'huevos-')+String(region.nombre_region).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-')+'-'+new Date().toISOString().slice(0,10)+'.png';
  artworkImage.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},'image/png');
 };
});

async function renderChickenArtwork(){
 const version=++artworkVersion;artworkReady=false;ae('artwork-download').disabled=true;ae('artwork-preview').hidden=true;
 try{
  const rows=ChickenCatalog.publish(artworkData,artworkRegion);
  ae('artwork-status').textContent='Preparando imagen de pollos…';
  const img=new Image();img.src='img/precios/pollos.png';await img.decode();if(version!==artworkVersion)return;
  const canvas=ae('artwork-preview');canvas.width=1880;canvas.height=1576;let ctx=canvas.getContext('2d');
  const footer=artworkFooter(ctx,artworkData.regiones.find(r=>r.region_id===artworkRegion).nombre_region,artworkBranches);
  canvas.height=footer.height*2;ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.drawImage(img,0,0,940,703);
  // The template supplies only the artwork. All labels, prices and branch details are rendered from current data.
  ctx.fillStyle='#ffdaa0';ctx.fillRect(435,150,395,465);ctx.fillRect(0,620,940,footer.height-620);
  ctx.strokeStyle='#d88951';ctx.lineWidth=1;ctx.fillStyle='#392719';ctx.textBaseline='middle';
  ctx.font='700 13px Arial';ctx.textAlign='center';ctx.fillText('PRECIO',758,165);
  const line=y=>{ctx.beginPath();ctx.moveTo(440,y);ctx.lineTo(825,y);ctx.stroke();};line(180);
  rows.forEach((row,index)=>{
   const y=180+index*58;ctx.textAlign='left';let size=23;const label=row.producto+' x '+row.presentacion;ctx.font=size+'px Georgia';while(ctx.measureText(label).width>250&&size>14){size--;ctx.font=size+'px Georgia';}ctx.fillText(label,446,y+29);
   const price='$'+row.precio.toLocaleString('es-AR',{maximumFractionDigits:2});size=24;ctx.font=size+'px Georgia';while(ctx.measureText(price).width>119&&size>13){size--;ctx.font=size+'px Georgia';}ctx.fillText(price,708,y+29);line(y+58);
  });
  ctx.beginPath();ctx.moveTo(698,180);ctx.lineTo(698,586);ctx.stroke();
  ctx.textAlign='left';ctx.textBaseline='top';for(const line of footer.lines){ctx.font=line.font;ctx.fillStyle='#a84219';ctx.fillText(line.text,30,line.y);}
  canvas.hidden=false;artworkImage=canvas;artworkReady=true;ae('artwork-download').disabled=false;ae('artwork-status').textContent='Pollos · 7 presentaciones · Precios consultados a las '+artworkLoadedAt+'.';
 }catch(error){if(version===artworkVersion)ae('artwork-status').textContent=error.message;}
}
