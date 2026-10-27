(function(root){
 const WIDTH=1080,HEIGHT=1080,SCALE=1,PAGE_SIZE=6;
 function pages(branches){if(!branches.length)throw Error('No hay sucursales para publicar.');const result=[];for(let i=0;i<branches.length;i+=PAGE_SIZE)result.push(branches.slice(i,i+PAGE_SIZE));return result;}
 function wrap(ctx,value,width){const result=[];let line='';for(const word of String(value||'').trim().split(/\s+/)){if(ctx.measureText((line?line+' ':'')+word).width<=width){line+=(line?' ':'')+word;continue;}if(line){result.push(line);line='';}for(const char of word){if(ctx.measureText(line+char).width>width){result.push(line);line='';}line+=char;}}if(line)result.push(line);return result;}
 function text(ctx,value,x,y,width,size=28,{bold=false,color='#382719',align='left',family='Arial'}={}){ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='top';ctx.font=(bold?'700 ':'')+size+'px '+family;while(ctx.measureText(String(value)).width>width&&size>17){size--;ctx.font=(bold?'700 ':'')+size+'px '+family;}if(ctx.measureText(String(value)).width>width)throw Error('El texto es demasiado largo para publicar: '+value);ctx.fillText(String(value),x,y);}
 function box(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
 function brand(ctx,logo){ctx.drawImage(logo,124,102,264,286,790,1000,57,62);text(ctx,'Potage',858,1006,190,40,{bold:true,color:'#ef5126'});text(ctx,'— S.R.L. —',875,1046,160,14,{bold:true,color:'#ef5126'});}
 function footer(ctx,branches,compact,page,total){
  const cols=compact?2:Math.min(branches.length,3),gap=20,w=(1004-(cols-1)*gap)/cols,rows=Math.ceil(branches.length/cols),h=compact?Math.min(112,(222-(rows-1)*10)/rows):220;
  for(const [i,b]of branches.entries()){
   const x=38+(i%cols)*(w+gap),y=768+Math.floor(i/cols)*(h+10);let chosen;
   for(let size=compact?24:25;size>=17;size--){ctx.font='700 '+size+'px Arial';const name=wrap(ctx,'Sede '+b.ubicacion,w);ctx.font=size+'px Arial';const address=compact?[]:wrap(ctx,b.direccion,w),phone=wrap(ctx,b.contacto,w);if((name.length+address.length+phone.length)*(size+4)+8<=h){chosen={size,name,address,phone};break;}}
   if(!chosen)throw Error('La información de '+b.ubicacion+' es demasiado extensa. Revisá nombre, dirección y contacto en Sucursales.');
   let ty=y;for(const [lines,bold]of [[chosen.name,true],[chosen.address,false],[chosen.phone,true]]){ctx.font=(bold?'700 ':'')+chosen.size+'px Arial';ctx.fillStyle=bold?'#af3b1b':'#493326';ctx.textAlign='left';ctx.textBaseline='top';for(const line of lines){ctx.fillText(line,x,ty);ty+=chosen.size+4;}if(lines.length)ty+=4;}
  }
  text(ctx,'Precios sujetos a disponibilidad de stock',38,1045,710,17,{color:'#6a4834'});
  if(total>1)text(ctx,page+' / '+total,38,1015,80,17,{color:'#6a4834'});
 }
 function render({canvasFactory,kind,branches,rows,assets}){
  const chunks=pages(branches),compact=branches.length>3;
  return chunks.map((branches,page)=>{
   const canvas=canvasFactory();canvas.width=WIDTH;canvas.height=HEIGHT;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   const chicken=kind==='pollos';box(ctx,0,0,WIDTH,HEIGHT,chicken?'#ffdda5':'#ffe36d');
   ctx.save();ctx.translate(107,94);ctx.rotate(-.65);box(ctx,-205,-46,410,92,'#ffffff');text(ctx,'producción',0,-34,320,30,{align:'center',color:'#f1582c'});text(ctx,'propia',0,2,320,30,{align:'center',color:'#f1582c'});ctx.restore();
   text(ctx,'LISTA DE',600,35,660,63,{align:'center',color:'#f05226',family:'Georgia'});text(ctx,'precios',600,98,660,75,{align:'center',color:'#ff791e',family:'"Brush Script MT", cursive'});
   if(chicken){
    ctx.save();ctx.beginPath();ctx.rect(48,215,280,483);ctx.clip();ctx.drawImage(assets.source,130,162,215,400,48,215,280,483);ctx.restore();
    text(ctx,'POLLOS',360,188,660,22,{bold:true,color:'#943b1d'});box(ctx,356,222,680,45,'#f3bf85');text(ctx,'PRODUCTO / PRESENTACIÓN',370,235,440,20,{bold:true});text(ctx,'PRECIO',1018,235,180,20,{bold:true,align:'right'});
    rows.forEach((r,i)=>{const y=278+i*62;box(ctx,356,y,680,54,'#fff0d5');text(ctx,r.producto+' x '+r.presentacion,370,y+15,425,25,{family:'Georgia'});text(ctx,money(r.precio),1018,y+15,205,27,{bold:true,align:'right'});});
   }else{
    for(let group=0;group<2;group++){
     const x=34+group*516;box(ctx,x,210,496,510,'#ffeda6');text(ctx,'Huevos',x+16,250,205,33,{color:'#161616'});text(ctx,group?'colorados':'blancos',x+16,293,205,33,{color:'#161616'});
     const crop=group?[650,185,260,145]:[190,200,220,130];ctx.drawImage(assets.source,...crop,x+205,222,275,153);
     const columns=[[x+10,144],[x+170,144],[x+330,156]];
     ['TAMAÑO','MAPLE','CAJÓN'].forEach((label,i)=>{const [cx,width]=columns[i];box(ctx,cx,397,width,65,'#ffdaa0');text(ctx,label,cx+width/2,418,width-12,25,{bold:true,align:'center'});});
     for(let i=0;i<3;i++){const row=rows[group*3+i],y=479+i*77;const labels=[row?.tipo_huevo||'—',row?money(row.precio_maple):'—',row?money(row.precio_cajon):'—'];labels.forEach((label,col)=>{const [cx,width]=columns[col];box(ctx,cx,y,width,64,'#fff5d8');text(ctx,label,cx+width/2,y+19,width-12,28,{bold:true,align:'center'});});}
    }
    text(ctx,'Maple: 30 huevos · Cajón: 12 maples',38,734,1004,19,{color:'#78421e'});
   }
   footer(ctx,branches,compact,page+1,chunks.length);brand(ctx,assets.logo);return canvas;
  });
 }
 function money(value){return '$'+value.toLocaleString('es-AR',{maximumFractionDigits:2});}
 const api={WIDTH,HEIGHT,SCALE,PAGE_SIZE,pages,wrap,render};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SocialArtwork=api;
})(typeof globalThis!=='undefined'?globalThis:this);
