(function(root){
 const LAYOUT_WIDTH=1080,LAYOUT_HEIGHT=1350,SCALE=4/3;
 const WIDTH=1440,HEIGHT=1800,PAGE_SIZE=6;
 const FORMAT_LABEL='1440 × 1800 px · Vertical 4:5';
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
 function brand(ctx,logo){
  ctx.drawImage(logo,124,102,264,286,772,1250,72,78);
  text(ctx,'Potage',858,1256,190,43,{bold:true,color:'#ef5126'});
  text(ctx,'— S.R.L. —',945,1305,180,16,{bold:true,color:'#ef5126',align:'center'});
 }
 function contact(ctx,branch,x,y,w,h,{compact,single}){
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
   ctx.font=(bold?'700 ':'')+layout.size+'px Arial';ctx.fillStyle=bold?'#af3b1b':'#493326';ctx.textAlign=align;ctx.textBaseline='top';
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
 function footer(ctx,branches,compact,page,total){
  text(ctx,'ENCONTRANOS EN NUESTRAS SUCURSALES',40,940,1000,20,{bold:true,color:'#af3b1b'});
  const cols=compact?2:1,gap=24,rowGap=12,w=(1000-(cols-1)*gap)/cols;
  const rowCount=Math.ceil(branches.length/cols),h=(260-(rowCount-1)*rowGap)/rowCount;
  branches.forEach((branch,i)=>{
   const x=40+(i%cols)*(w+gap),y=968+Math.floor(i/cols)*(h+rowGap);
   contact(ctx,branch,x,y,w,h,{compact,single:!compact&&branches.length===1});
   if(Math.floor(i/cols)<rowCount-1)box(ctx,x,y+h+rowGap/2,w,1,'#dfb560');
  });
  text(ctx,'Precios sujetos a disponibilidad de stock',40,1310,690,18,{color:'#6a4834'});
  if(total>1)text(ctx,page+' / '+total,40,1268,80,18,{color:'#6a4834'});
 }
 function header(ctx){
  ctx.save();ctx.translate(100,105);ctx.rotate(-.65);box(ctx,-205,-46,410,92,'#ffffff');
  text(ctx,'producción',0,-34,320,30,{align:'center',color:'#f1582c'});text(ctx,'propia',0,2,320,30,{align:'center',color:'#f1582c'});ctx.restore();
  text(ctx,'LISTA DE',LAYOUT_WIDTH/2,58,650,72,{align:'center',color:'#f05226',family:'Georgia'});
  text(ctx,'precios',LAYOUT_WIDTH/2,137,650,88,{align:'center',color:'#ff791e',family:'"Brush Script MT", "Segoe Script", cursive'});
 }
 function eggs(ctx,rows,source){
  for(let group=0;group<2;group++){
   const x=40+group*512;box(ctx,x,268,488,610,'#ffeda6');
   text(ctx,'Huevos',x+16,313,185,34,{color:'#161616'});text(ctx,group?'colorados':'blancos',x+16,356,185,34,{color:'#161616'});
   const crop=group?[650,185,260,145]:[190,200,220,130];ctx.drawImage(source,...crop,x+200,292,276,162);
   const columns=[[x+12,144],[x+168,144],[x+324,148]];
   ['TAMAÑO','MAPLE','CAJÓN'].forEach((label,i)=>{const [cx,width]=columns[i];box(ctx,cx,476,width,76,'#ffdaa0');text(ctx,label,cx+width/2,500,width-12,25,{bold:true,align:'center'});});
   for(let i=0;i<3;i++){
    const row=rows[group*3+i],y=572+i*92;
    const labels=[row?.tipo_huevo||'—',row?money(row.precio_maple):'—',row?money(row.precio_cajon):'—'];
    labels.forEach((label,col)=>{const [cx,width]=columns[col];box(ctx,cx,y,width,78,'#fff5d8');text(ctx,label,cx+width/2,y+23,width-12,31,{bold:true,align:'center'});});
   }
  }
  text(ctx,'Maple: 30 huevos · Cajón: 12 maples',40,900,1000,22,{color:'#78421e'});
 }
 function chicken(ctx,rows,source){
  ctx.save();ctx.beginPath();ctx.rect(40,322,290,540);ctx.clip();ctx.drawImage(source,130,162,215,400,40,322,290,540);ctx.restore();
  text(ctx,'POLLOS',354,248,660,24,{bold:true,color:'#943b1d'});
  box(ctx,350,286,690,54,'#f3bf85');text(ctx,'PRODUCTO / PRESENTACIÓN',366,303,440,21,{bold:true});text(ctx,'PRECIO',1024,303,180,21,{bold:true,align:'right'});
  rows.forEach((row,i)=>{
   const y=358+i*76;box(ctx,350,y,690,66,'#fff0d5');
   text(ctx,row.producto+' x '+row.presentacion,366,y+20,432,27,{family:'Georgia'});text(ctx,money(row.precio),1024,y+18,210,31,{bold:true,align:'right'});
  });
 }
 function render({canvasFactory,kind,branches,rows,assets}){
  const chunks=pages(branches),compact=branches.length>3;
  return chunks.map((branches,page)=>{
   const canvas=canvasFactory();canvas.width=WIDTH;canvas.height=HEIGHT;
   const ctx=canvas.getContext('2d');ctx.scale(SCALE,SCALE);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   box(ctx,0,0,LAYOUT_WIDTH,LAYOUT_HEIGHT,kind==='pollos'?'#ffdda5':'#ffe36d');header(ctx);
   if(kind==='pollos')chicken(ctx,rows,assets.source);else eggs(ctx,rows,assets.source);
   footer(ctx,branches,compact,page+1,chunks.length);brand(ctx,assets.logo);return canvas;
  });
 }
 function money(value){return '$'+value.toLocaleString('es-AR',{maximumFractionDigits:2});}
 const api={WIDTH,HEIGHT,SCALE,PAGE_SIZE,FORMAT_LABEL,pages,wrap,render};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SocialArtwork=api;
})(typeof globalThis!=='undefined'?globalThis:this);
