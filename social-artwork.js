(function(root){
 const WIDTH=2240,HEIGHT=1880,SCALE=1,PAGE_SIZE=6;
 const ASPECT_RATIO=WIDTH/HEIGHT,SAFE_MARGIN=96,SAFE_MARGIN_PX=SAFE_MARGIN*SCALE;
 const FORMAT_LABEL='2240 × 1880 px · Horizontal 1.19:1';
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
 // Zonas del diseño horizontal (2240 × 1880) con 96 px de margen seguro.
 const DEFAULT_ZONES={
  eggs:{x:96,y:390,w:2048,h:820},
  chicken:{x:96,y:390,w:2048,h:820},
  branches:{x:96,y:1248,w:2048,h:396},
  brand:{x:96,y:96,w:300,h:260}
 };
 // Área que ocupa cada bloque dentro de su zona; permite reutilizar plantillas con fondo.
 const BLOCK_BOUNDS={
  eggs:{x:96,y:390,w:2048,h:820},
  chicken:{x:96,y:390,w:2048,h:820},
  branches:{x:96,y:1248,w:2048,h:396},
  brand:{x:96,y:96,w:300,h:260}
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
  while(ctx.measureText(String(value)).width>width&&size>12){size--;ctx.font=(bold?'700 ':'')+size+'px '+family;}
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
 function contain(ctx,image,x,y,w,h){
  const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
  if(!iw||!ih)return;
  const scale=Math.min(w/iw,h/ih),dw=iw*scale,dh=ih*scale;
  ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
 }
 // Recorta una foto de la plantilla original sin deformarla ni estirarla.
 function cropContain(ctx,image,crop,x,y,w,h){
  const [sx,sy,sw,sh]=crop;
  const scale=Math.min(w/sw,h/sh),dw=sw*scale,dh=sh*scale;
  ctx.drawImage(image,sx,sy,sw,sh,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
 }
 function brand(ctx,logo,theme){
  const x=SAFE_MARGIN,y=SAFE_MARGIN,w=300,cx=x+w/2;
  if(logo){
   contain(ctx,logo,cx-85,y,170,170);
   text(ctx,theme.brand,cx,y+182,w,40,{bold:true,color:theme.colors.brand,align:'center'});
   if(theme.subtitle)text(ctx,theme.subtitle,cx,y+232,w,20,{bold:true,color:theme.colors.brand,align:'center'});
  }else{
   text(ctx,theme.brand,cx,y+58,w,56,{bold:true,color:theme.colors.brand,align:'center'});
   if(theme.subtitle)text(ctx,theme.subtitle,cx,y+132,w,26,{bold:true,color:theme.colors.brand,align:'center'});
  }
 }
 // Datos de sucursal en tarjetas: legibles y con ajuste automático de tamaño.
 function contact(ctx,branch,x,y,w,h,{compact,single},theme){
  let layout;
  const maxSize=single?44:compact?30:34;
  const minSize=compact?20:24;
  for(let size=maxSize;size>=minSize;size--){
   ctx.font='700 '+size+'px Arial';
   const name=wrap(ctx,'Sede '+branch.ubicacion,w);
   const phone=wrap(ctx,branch.contacto,w);
   ctx.font=size+'px Arial';
   const address=compact?[]:wrap(ctx,branch.direccion,w);
   const lineHeight=size+Math.max(4,Math.round(size*.18));
   const height=(name.length+address.length+phone.length)*lineHeight+8;
   if(height<=h){layout={size,name,address,phone,lineHeight,height};break;}
  }
  if(!layout)throw Error('La información de '+branch.ubicacion+' es demasiado extensa. Revisá nombre, dirección y contacto en Sucursales.');
  const align=single?'center':'left',tx=single?x+w/2:x;
  let ty=y+(h-layout.height)/2;
  function lines(values,top,bold){
   ctx.font=(bold?'700 ':'')+layout.size+'px Arial';
   ctx.fillStyle=bold?theme.colors.branchName:theme.colors.branchText;
   ctx.textAlign=align;ctx.textBaseline='top';
   for(const line of values){ctx.fillText(line,tx,top);top+=layout.lineHeight;}return top;
  }
  ty=lines(layout.name,ty,true);
  if(layout.address.length)ty=lines(layout.address,ty,false);
  lines(layout.phone,ty,true);
 }
 function footer(ctx,branches,compact,page,total,theme){
  text(ctx,theme.footerTitle,WIDTH/2,1248,1800,38,{bold:true,color:theme.colors.footerTitle,align:'center'});
  const top=1302,height=342,gap=compact?28:32;
  const cols=compact?3:branches.length,rowCount=Math.ceil(branches.length/cols);
  const cardW=(WIDTH-SAFE_MARGIN*2-(cols-1)*gap)/cols;
  const cardH=compact?(height-(rowCount-1)*20)/rowCount:height;
  branches.forEach((branch,i)=>{
   const x=SAFE_MARGIN+(i%cols)*(cardW+gap),y=top+Math.floor(i/cols)*(cardH+20);
   box(ctx,x,y,cardW,cardH,theme.panel);
   box(ctx,x,y,cardW,6,theme.colors.divider);
   contact(ctx,branch,x+24,y+20,cardW-48,cardH-40,{compact,single:!compact&&branches.length===1},theme);
  });
  if(theme.footnote)text(ctx,theme.footnote,SAFE_MARGIN,1676,1400,26,{color:theme.colors.note});
  if(total>1)text(ctx,page+' / '+total,WIDTH-SAFE_MARGIN,1676,200,26,{color:theme.colors.note,align:'right'});
 }
 function header(ctx,theme){
  if(theme.tagline.length){
   const lines=theme.tagline.slice(0,2),tagW=340,tagX=WIDTH-SAFE_MARGIN-tagW;
   box(ctx,tagX,112,tagW,124,theme.colors.tagline);
   lines.forEach((line,i)=>text(ctx,line,tagX+tagW/2,128+i*46,tagW-32,36,{align:'center',color:theme.colors.taglineText}));
  }
  // El título completo queda centrado sobre el ancho total del lienzo.
  text(ctx,theme.titleTop,WIDTH/2,96,1200,96,{align:'center',color:theme.colors.title,family:'Georgia'});
  text(ctx,theme.titleBottom,WIDTH/2,196,1200,148,{align:'center',color:theme.colors.titleAccent,family:'"Brush Script MT", "Segoe Script", cursive'});
  box(ctx,SAFE_MARGIN,364,WIDTH-SAFE_MARGIN*2,4,theme.colors.divider);
 }
 function eggs(ctx,rows,source,theme,custom){
  const panelW=1000,panelH=820,y=390,gap=48;
  for(let group=0;group<2;group++){
   const x=SAFE_MARGIN+group*(panelW+gap);
   box(ctx,x,y,panelW,panelH,theme.colors.eggPanel);
   box(ctx,x,y,panelW,10,theme.colors.title);
   text(ctx,'Huevos',x+36,y+34,430,64,{color:theme.colors.eggText});
   text(ctx,group?'colorados':'blancos',x+36,y+104,430,64,{color:theme.colors.eggText});
   if(source){
    if(custom)contain(ctx,source,x+540,y+32,420,250);
    else cropContain(ctx,source,group?[650,185,260,145]:[190,200,220,130],x+540,y+32,420,250);
   }
   const tableX=x+24,tableW=panelW-48,columnGap=10;
   const widths=[240,300,tableW-240-300-columnGap*2];
   const columns=[];let cursor=tableX;
   for(const width of widths){columns.push([cursor,width]);cursor+=width+columnGap;}
   ['TAMAÑO','MAPLE','CAJÓN'].forEach((label,i)=>{
    const [cx,width]=columns[i];
    box(ctx,cx,y+300,width,82,theme.colors.tableHead);
    text(ctx,label,cx+width/2,y+322,width-16,36,{bold:true,align:'center'});
   });
   for(let i=0;i<3;i++){
    const row=rows[group*3+i],ry=y+400+i*126;
    const labels=[row?.tipo_huevo||'—',row?money(row.precio_maple):'—',row?money(row.precio_cajon):'—'];
    labels.forEach((label,col)=>{
     const [cx,width]=columns[col];
     box(ctx,cx,ry,width,116,theme.colors.tableRow);
     text(ctx,label,cx+width/2,ry+32,width-16,50,{bold:true,align:'center'});
    });
   }
   text(ctx,'Maple: 30 huevos · Cajón: 12 maples',x+panelW/2,y+782,panelW-40,24,{color:theme.colors.eggFootnote,align:'center'});
  }
 }
 function chicken(ctx,rows,source,theme,custom){
  const y=390,panelH=820,panelW=680;
  box(ctx,SAFE_MARGIN,y,panelW,panelH,theme.colors.chickenRow);
  box(ctx,SAFE_MARGIN,y,panelW,10,theme.colors.chickenLabel);
  const frameX=SAFE_MARGIN+40,frameY=y+30,frameW=600,frameH=520;
  box(ctx,frameX,frameY,frameW,frameH,theme.colors.eggPanel);
  if(source){
   if(custom)contain(ctx,source,frameX+10,frameY+10,frameW-20,frameH-20);
   else cropContain(ctx,source,[130,162,215,400],frameX+10,frameY+10,frameW-20,frameH-20);
  }
  const centerX=SAFE_MARGIN+panelW/2;
  text(ctx,'POLLOS',centerX,y+590,600,74,{bold:true,color:theme.colors.chickenLabel,align:'center'});
  text(ctx,'7 presentaciones',centerX,y+684,600,42,{color:theme.colors.chickenLabel,align:'center'});
  text(ctx,'producción propia',centerX,y+740,600,42,{color:theme.colors.titleAccent,align:'center'});
  const tx=824,tw=1320;
  box(ctx,tx,y,tw,panelH,theme.colors.chickenRow);
  box(ctx,tx,y,tw,10,theme.colors.chickenLabel);
  box(ctx,tx+20,y+30,tw-40,84,theme.colors.chickenHead);
  text(ctx,'PRODUCTO / PRESENTACIÓN',tx+40,y+52,800,34,{bold:true});
  text(ctx,'PRECIO',tx+tw-40,y+52,300,34,{bold:true,align:'right'});
  rows.forEach((row,i)=>{
   const ry=y+140+i*94;
   box(ctx,tx+20,ry,tw-40,88,theme.colors.tableRow);
   text(ctx,row.producto+' x '+row.presentacion,tx+40,ry+16,860,38,{family:'Georgia'});
   text(ctx,money(row.precio),tx+tw-40,ry+12,320,42,{bold:true,align:'right'});
  });
 }
 function renderDefault(ctx,kind,branches,rows,assets,theme,page,total,compact){
  box(ctx,0,0,WIDTH,HEIGHT,kind==='pollos'?theme.colors.pageChicken:theme.colors.pageEggs);
  header(ctx,theme);
  if(kind==='pollos')chicken(ctx,rows,assets.source,theme,assets.sourceCustom);
  else eggs(ctx,rows,assets.source,theme,assets.sourceCustom);
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
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,WIDTH,HEIGHT);
  cover(ctx,assets.background,0,0,WIDTH,HEIGHT,false);
  if(theme.showTitle)header(ctx,theme);
  const priceKey=kind==='pollos'?'chicken':'eggs';
  placeBlock(ctx,theme.zones[priceKey],BLOCK_BOUNDS[priceKey],theme.panel,()=>{
   if(kind==='pollos')chicken(ctx,rows,assets.source,theme,assets.sourceCustom);
   else eggs(ctx,rows,assets.source,theme,assets.sourceCustom);
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
