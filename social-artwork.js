(function(root){
 const LAYOUT_WIDTH=1080,LAYOUT_HEIGHT=1350,SCALE=4/3;
 const WIDTH=1440,HEIGHT=1800,PAGE_SIZE=6;
 const ASPECT_RATIO=4/5,SAFE_MARGIN=36,SAFE_MARGIN_PX=SAFE_MARGIN*SCALE;
 const FORMAT_LABEL='1440 × 1800 px · Vertical 4:5';
 const PNG_SIGNATURE=[137,80,78,71,13,10,26,10];
 const DEFAULT_COLORS={
  pageEggs:'#ffe36d',pageChicken:'#ffdda5',
  eggPanel:'#ffeda6',eggText:'#161616',
  tableHead:'#ffdaa0',tableRow:'#fff5d8',
  title:'#f05226',titleAccent:'#ff791e',
  tagline:'#ffffff',taglineText:'#f1582c',
  brand:'#ef5126',
  footerTitle:'#af3b1b',branchName:'#af3b1b',branchText:'#493326',
  divider:'#dfb560',note:'#6a4834',eggFootnote:'#78421e',
  chickenLabel:'#943b1d',chickenHead:'#f3bf85',chickenRow:'#fff0d5'
 };
 // Zonas con margen de seguridad de 36 unidades de diseño (48 px finales).
 const DEFAULT_ZONES={
  eggs:{x:40,y:260,w:1000,h:660},
  chicken:{x:40,y:248,w:1000,h:632},
  branches:{x:40,y:930,w:1000,h:340},
  brand:{x:748,y:1234,w:292,h:80}
 };
 // Área que ocupa cada bloque del diseño para escalarlo dentro de una zona.
 const BLOCK_BOUNDS={
  eggs:{x:40,y:268,w:992,h:660},
  chicken:{x:40,y:248,w:1000,h:632},
  branches:{x:40,y:940,w:1000,h:390},
  brand:{x:772,y:1236,w:272,h:78}
 };
 function normalizeTemplate(template){
  const source=template||{};
  return {
   brand:source.brand||'Potage',
   subtitle:source.subtitle===undefined?'— S.R.L. —':source.subtitle,
   titleTop:source.titleTop||'LISTA DE',
   titleBottom:source.titleBottom||'precios',
   tagline:Array.isArray(source.tagline)?source.tagline:['producción','propia'],
   footerTitle:source.footerTitle||'ENCONTRANOS EN NUESTRAS SUCURSALES',
   footnote:source.footnote===undefined?'Precios sujetos a disponibilidad de stock':source.footnote,
   layout:source.layout||'auto',
   showBrand:source.showBrand===true,
   showTitle:source.showTitle===true,
   colors:{...DEFAULT_COLORS,...(source.colors||{})},
   zones:{...DEFAULT_ZONES,...(source.zones||{})},
   panel:source.panel===undefined?'rgba(255,255,255,.9)':source.panel
  };
 }
 function pages(branches){
  if(!branches.length)throw Error('No hay sucursales para publicar.');
  const result=[];for(let i=0;i<branches.length;i+=PAGE_SIZE)result.push(branches.slice(i,i+PAGE_SIZE));return result;
 }
 function wrap(ctx,value,width){
  const result=[];let line='';
  for(const word of String(value||'').trim().split(/\s+/)){
   if(ctx.measureText((line?line+' ':'')+word).width<=width){line+=(line?' ':'')+word;continue;}
   if(line){result.push(line);line='';}
   for(const char of word){if(ctx.measureText(line+char).width>width){result.push(line);line='';}line+=char;}
  }
  if(line)result.push(line);return result;
 }
 function text(ctx,value,x,y,width,size=28,{bold=false,color='#382719',align='left',family='Arial'}={}){
  ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='top';ctx.font=(bold?'700 ':'')+size+'px '+family;
  while(ctx.measureText(String(value)).width>width&&size>17){size--;ctx.font=(bold?'700 ':'')+size+'px '+family;}
  if(ctx.measureText(String(value)).width>width)throw Error('El texto es demasiado largo para publicar: '+value);
  ctx.fillText(String(value),x,y);
 }
 function box(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
 function cover(ctx,image,x,y,w,h,clip){
  const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
  if(!iw||!ih){ctx.drawImage(image,x,y,w,h);return;}
  const scale=Math.max(w/iw,h/ih),dw=iw*scale,dh=ih*scale;
  if(clip){ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();}
  ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
  if(clip)ctx.restore();
 }
 function brand(ctx,logo,theme){
  if(logo){
   ctx.drawImage(logo,124,102,264,286,772,1236,72,78);
   text(ctx,theme.brand,858,1242,186,43,{bold:true,color:theme.colors.brand});
   if(theme.subtitle)text(ctx,theme.subtitle,945,1291,180,16,{bold:true,color:theme.colors.brand,align:'center'});
  }else{
   text(ctx,theme.brand,772,1238,272,46,{bold:true,color:theme.colors.brand});
   if(theme.subtitle)text(ctx,theme.subtitle,772,1291,272,16,{bold:true,color:theme.colors.brand});
  }
 }
 function contact(ctx,branch,x,y,w,h,{compact,single},theme){
  let layout;
  for(let size=single?32:compact?26:28;size>=17;size--){
   ctx.font='700 '+size+'px Arial';
   const name=wrap(ctx,'Sede '+branch.ubicacion,compact||single?w:w*.51);
   const phone=wrap(ctx,branch.contacto,compact||single?w:w*.45);
   ctx.font=size+'px Arial';
   const address=compact?[]:wrap(ctx,branch.direccion,w);
   const lines=compact||single?name.length+address.length+phone.length:Math.max(name.length,phone.length)+address.length;
   const height=lines*(size+4)+12;
   if(height<=h){layout={size,name,address,phone,height};break;}
  }
  if(!layout)throw Error('La información de '+branch.ubicacion+' es demasiado extensa. Revisá nombre, dirección y contacto en Sucursales.');
  let ty=y+(h-layout.height)/2+6;
  function lines(values,tx,top,bold,align='left'){
   ctx.font=(bold?'700 ':'')+layout.size+'px Arial';ctx.fillStyle=bold?theme.colors.branchName:theme.colors.branchText;ctx.textAlign=align;ctx.textBaseline='top';
   for(const line of values){ctx.fillText(line,tx,top);top+=layout.size+4;}return top;
  }
  if(single){
   ty=lines(layout.name,x+w/2,ty,true,'center');ty=lines(layout.address,x+w/2,ty,false,'center');lines(layout.phone,x+w/2,ty,true,'center');
  }else if(compact){
   ty=lines(layout.name,x,ty,true);lines(layout.phone,x,ty,true);
  }else{
   lines(layout.name,x,ty,true);lines(layout.phone,x+w,ty,true,'right');
   ty+=Math.max(layout.name.length,layout.phone.length)*(layout.size+4);lines(layout.address,x,ty,false);
  }
 }
 function footer(ctx,branches,compact,page,total,theme){
  text(ctx,theme.footerTitle,40,940,1000,20,{bold:true,color:theme.colors.footerTitle});
  const cols=compact?2:1,gap=24,rowGap=12,w=(1000-(cols-1)*gap)/cols;
  const rowCount=Math.ceil(branches.length/cols),h=(260-(rowCount-1)*rowGap)/rowCount;
  branches.forEach((branch,i)=>{
   const x=40+(i%cols)*(w+gap),y=968+Math.floor(i/cols)*(h+rowGap);
   contact(ctx,branch,x,y,w,h,{compact,single:!compact&&branches.length===1},theme);
   if(Math.floor(i/cols)<rowCount-1)box(ctx,x,y+h+rowGap/2,w,1,theme.colors.divider);
  });
  if(theme.footnote)text(ctx,theme.footnote,40,1294,690,18,{color:theme.colors.note});
  if(total>1)text(ctx,page+' / '+total,40,1252,80,18,{color:theme.colors.note});
 }
 function header(ctx,theme){
  if(theme.tagline.length){
   ctx.save();ctx.translate(100,105);ctx.rotate(-.65);box(ctx,-205,-46,410,92,theme.colors.tagline);
   theme.tagline.slice(0,2).forEach((line,i)=>text(ctx,line,0,-34+i*36,320,30,{align:'center',color:theme.colors.taglineText}));
   ctx.restore();
  }
  text(ctx,theme.titleTop,LAYOUT_WIDTH/2,58,650,72,{align:'center',color:theme.colors.title,family:'Georgia'});
  text(ctx,theme.titleBottom,LAYOUT_WIDTH/2,137,650,88,{align:'center',color:theme.colors.titleAccent,family:'"Brush Script MT", "Segoe Script", cursive'});
 }
 function eggs(ctx,rows,source,theme,custom){
  for(let group=0;group<2;group++){
   const x=40+group*512;box(ctx,x,268,488,610,theme.colors.eggPanel);
   text(ctx,'Huevos',x+16,313,185,34,{color:theme.colors.eggText});text(ctx,group?'colorados':'blancos',x+16,356,185,34,{color:theme.colors.eggText});
   if(source){
    if(custom)cover(ctx,source,x+200,292,276,162,true);
    else{const crop=group?[650,185,260,145]:[190,200,220,130];ctx.drawImage(source,...crop,x+200,292,276,162);}
   }
   const columns=[[x+12,144],[x+168,144],[x+324,148]];
   ['TAMAÑO','MAPLE','CAJÓN'].forEach((label,i)=>{const [cx,width]=columns[i];box(ctx,cx,476,width,76,theme.colors.tableHead);text(ctx,label,cx+width/2,500,width-12,25,{bold:true,align:'center'});});
   for(let i=0;i<3;i++){
    const row=rows[group*3+i],y=572+i*92;
    const labels=[row?.tipo_huevo||'—',row?money(row.precio_maple):'—',row?money(row.precio_cajon):'—'];
    labels.forEach((label,col)=>{const [cx,width]=columns[col];box(ctx,cx,y,width,78,theme.colors.tableRow);text(ctx,label,cx+width/2,y+23,width-12,31,{bold:true,align:'center'});});
   }
  }
  text(ctx,'Maple: 30 huevos · Cajón: 12 maples',40,900,1000,22,{color:theme.colors.eggFootnote});
 }
 function chicken(ctx,rows,source,theme,custom){
  if(source){
   if(custom)cover(ctx,source,40,322,290,540,true);
   else{ctx.save();ctx.beginPath();ctx.rect(40,322,290,540);ctx.clip();ctx.drawImage(source,130,162,215,400,40,322,290,540);ctx.restore();}
  }
  text(ctx,'POLLOS',354,248,660,24,{bold:true,color:theme.colors.chickenLabel});
  box(ctx,350,286,690,54,theme.colors.chickenHead);text(ctx,'PRODUCTO / PRESENTACIÓN',366,303,440,21,{bold:true});text(ctx,'PRECIO',1024,303,180,21,{bold:true,align:'right'});
  rows.forEach((row,i)=>{
   const y=358+i*76;box(ctx,350,y,690,66,theme.colors.chickenRow);
   text(ctx,row.producto+' x '+row.presentacion,366,y+20,432,27,{family:'Georgia'});text(ctx,money(row.precio),1024,y+18,210,31,{bold:true,align:'right'});
  });
 }
 function renderDefault(ctx,kind,branches,rows,assets,theme,page,total,compact){
  box(ctx,0,0,LAYOUT_WIDTH,LAYOUT_HEIGHT,kind==='pollos'?theme.colors.pageChicken:theme.colors.pageEggs);header(ctx,theme);
  if(kind==='pollos')chicken(ctx,rows,assets.source,theme,assets.sourceCustom);else eggs(ctx,rows,assets.source,theme,assets.sourceCustom);
  footer(ctx,branches,compact,page,total,theme);
  brand(ctx,assets.logo,theme);
 }
 // Renderiza un bloque del diseño dentro de una zona de la plantilla, sin deformarlo.
 function placeBlock(ctx,zone,bounds,panel,draw){
  if(!zone||!bounds)return;
  if(panel){ctx.fillStyle=panel;ctx.fillRect(zone.x,zone.y,zone.w,zone.h);}
  const scale=Math.min(zone.w/bounds.w,zone.h/bounds.h);
  const ox=zone.x+(zone.w-bounds.w*scale)/2,oy=zone.y+(zone.h-bounds.h*scale)/2;
  ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);ctx.translate(-bounds.x,-bounds.y);draw();ctx.restore();
 }
 function renderArtwork(ctx,kind,branches,rows,assets,theme,page,total,compact){
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,LAYOUT_WIDTH,LAYOUT_HEIGHT);
  cover(ctx,assets.background,0,0,LAYOUT_WIDTH,LAYOUT_HEIGHT,false);
  if(theme.showTitle)header(ctx,theme);
  const priceKey=kind==='pollos'?'chicken':'eggs';
  placeBlock(ctx,theme.zones[priceKey],BLOCK_BOUNDS[priceKey],theme.panel,()=>{
   if(kind==='pollos')chicken(ctx,rows,assets.source,theme,assets.sourceCustom);else eggs(ctx,rows,assets.source,theme,assets.sourceCustom);
  });
  placeBlock(ctx,theme.zones.branches,BLOCK_BOUNDS.branches,theme.panel,()=>footer(ctx,branches,compact,page,total,theme));
  if(theme.showBrand)placeBlock(ctx,theme.zones.brand,BLOCK_BOUNDS.brand,null,()=>brand(ctx,assets.logo,theme));
 }
 function render({canvasFactory,kind,branches,rows,assets={},template}){
  const theme=normalizeTemplate(template);
  const chunks=pages(branches);
  const compact=branches.length>3;
  const hasBackground=!!assets.background;
  const useBackground=hasBackground&&theme.layout!=='default';
  if(theme.layout==='artwork'&&!hasBackground)throw Error('Falta la imagen de fondo de la plantilla de esta empresa.');
  return chunks.map((chunk,index)=>{
   const canvas=canvasFactory();canvas.width=WIDTH;canvas.height=HEIGHT;
   if(canvas.width!==WIDTH||canvas.height!==HEIGHT)throw Error('El lienzo de exportación debe medir '+WIDTH+' × '+HEIGHT+' px.');
   const ctx=canvas.getContext('2d');ctx.scale(SCALE,SCALE);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   if(useBackground)renderArtwork(ctx,kind,chunk,rows,assets,theme,index+1,chunks.length,compact);
   else renderDefault(ctx,kind,chunk,rows,assets,theme,index+1,chunks.length,compact);
   if(canvas.width!==WIDTH||canvas.height!==HEIGHT)throw Error('El lienzo cambió de tamaño durante el dibujo.');
   return canvas;
  });
 }
 function money(value){return '$'+value.toLocaleString('es-AR',{maximumFractionDigits:2});}
 function pngDimensions(buffer){
  const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
  if(bytes.length<24||PNG_SIGNATURE.some((value,index)=>bytes[index]!==value))throw Error('El archivo descargado no es un PNG válido.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return {width:view.getUint32(16),height:view.getUint32(20)};
 }
 async function verifyPngBlob(blob){
  if(!blob||blob.type!=='image/png')throw Error('La descarga no se generó como PNG.');
  const {width,height}=pngDimensions(await blob.arrayBuffer());
  if(width!==WIDTH||height!==HEIGHT)throw Error('El PNG descargado mide '+width+' × '+height+' px; debe medir '+WIDTH+' × '+HEIGHT+' px.');
  return {width,height,ratio:width/height};
 }
 const api={WIDTH,HEIGHT,SCALE,ASPECT_RATIO,SAFE_MARGIN,SAFE_MARGIN_PX,PAGE_SIZE,FORMAT_LABEL,DEFAULT_ZONES,pages,wrap,render,pngDimensions,verifyPngBlob};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SocialArtwork=api;
 })(typeof globalThis!=='undefined'?globalThis:this);
