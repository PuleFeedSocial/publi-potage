(function(root){
 const WIDTH=1080,HEIGHT=1350,SCALE=2,PAGE_SIZE=6;
 function pages(branches){if(!branches.length)throw Error('No hay sucursales para publicar.');const result=[];for(let i=0;i<branches.length;i+=PAGE_SIZE)result.push(branches.slice(i,i+PAGE_SIZE));return result;}
 function wrap(ctx,text,width){const result=[];let line='';for(const word of String(text||'').trim().split(/\s+/)){if(ctx.measureText((line?line+' ':'')+word).width<=width){line+=(line?' ':'')+word;continue;}if(line){result.push(line);line='';}for(const char of word){if(ctx.measureText(line+char).width>width){result.push(line);line='';}line+=char;}}if(line)result.push(line);return result;}
 function text(ctx,value,x,y,width,size=28,{bold=false,color='#382719',align='left'}={}){ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='top';ctx.font=(bold?'700 ':'')+size+'px Arial';while(ctx.measureText(String(value)).width>width&&size>18){size--;ctx.font=(bold?'700 ':'')+size+'px Arial';}if(ctx.measureText(String(value)).width>width)throw Error('El texto es demasiado largo para publicar: '+value);ctx.fillText(String(value),x,y);}
 function box(ctx,x,y,w,h,color,r=16){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
 function footer(ctx,region,branches,compact,page,total){
  text(ctx,'VISITANOS EN '+region,48,942,984,28,{bold:true,color:'#9b391a'});
  const cols=compact?2:Math.min(branches.length,3),gap=18,w=(984-(cols-1)*gap)/cols;
  const rows=Math.ceil(branches.length/cols),h=compact?Math.min(126,(302-(rows-1)*10)/rows):272;
  for(const [i,b]of branches.entries()){
   const x=48+(i%cols)*(w+gap),y=990+Math.floor(i/cols)*(h+10);box(ctx,x,y,w,h,'rgba(255,255,255,0.58)',10);
   // Fit complete text to its card, never clip or omit a branch or phone number.
   let chosen;
   for(let size=compact?25:27;size>=18;size--){
    ctx.font='700 '+size+'px Arial';const name=wrap(ctx,'Sede '+b.ubicacion,w-28);
    ctx.font=size+'px Arial';const address=compact?[]:wrap(ctx,b.direccion,w-28),phone=wrap(ctx,b.contacto,w-28);
    const height=(name.length+address.length+phone.length)*(size+5)+(compact?4:14);
    if(height<=h-16){chosen={size,name,address,phone};break;}
   }
   if(!chosen)throw Error('La información de '+b.ubicacion+' es demasiado extensa. Revisá nombre, dirección y contacto en Sucursales.');
   let ty=y+8;for(const [lines,bold]of [[chosen.name,true],[chosen.address,false],[chosen.phone,true]]){ctx.font=(bold?'700 ':'')+chosen.size+'px Arial';ctx.fillStyle=bold?'#8f3219':'#493326';ctx.textAlign='left';ctx.textBaseline='top';for(const line of lines){ctx.fillText(line,x+14,ty);ty+=chosen.size+5;}if(lines.length)ty+=compact?2:5;}
  }
  text(ctx,'Precios sujetos a disponibilidad de stock',48,1310,900,19,{color:'#6a4834'});
  if(total>1)text(ctx,page+' / '+total,1032,1310,90,19,{align:'right',color:'#6a4834'});
 }
 function render({canvasFactory,kind,region,branches,rows,assets}){
  const chunks=pages(branches),compact=branches.length>3;
  return chunks.map((branches,page)=>{
   const canvas=canvasFactory();canvas.width=WIDTH*SCALE;canvas.height=HEIGHT*SCALE;const ctx=canvas.getContext('2d');ctx.scale(SCALE,SCALE);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   const chicken=kind==='pollos';const bg=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);bg.addColorStop(0,chicken?'#ffe5b9':'#fff0a0');bg.addColorStop(1,chicken?'#ffcf91':'#ffde63');ctx.fillStyle=bg;ctx.fillRect(0,0,WIDTH,HEIGHT);
   // Use the high-resolution brand symbol, and draw all typography at export resolution.
   ctx.drawImage(assets.logo,124,102,264,286,48,42,88,96);
   text(ctx,'Potage',150,53,330,58,{bold:true,color:'#e74b22'});text(ctx,'S.R.L. · PRODUCCIÓN PROPIA',153,119,390,18,{bold:true,color:'#a53c1d'});
   text(ctx,'LISTA DE PRECIOS',1032,58,480,40,{bold:true,align:'right',color:'#a53c1d'});text(ctx,chicken?'POLLOS':'HUEVOS',1032,113,480,27,{bold:true,align:'right',color:'#a53c1d'});
   text(ctx,region,48,184,984,34,{bold:true,color:'#733319'});
   if(chicken){
    ctx.save();ctx.beginPath();ctx.roundRect(48,250,290,596,16);ctx.clip();ctx.drawImage(assets.source,130,162,215,400,48,250,290,596);ctx.restore();
    box(ctx,362,250,670,62,'#f1bb7c',10);text(ctx,'PRODUCTO / PRESENTACIÓN',380,271,430,20,{bold:true});text(ctx,'PRECIO',1010,271,180,20,{bold:true,align:'right'});
    rows.forEach((r,i)=>{const y=324+i*77;box(ctx,362,y,670,67,'rgba(255,255,255,.56)',8);text(ctx,r.producto+' · '+r.presentacion,380,y+21,410,27,{bold:true});text(ctx,money(r.precio),1010,y+20,205,30,{bold:true,align:'right'});});
   }else{
    for(let group=0;group<2;group++){
     const x=48+group*504;box(ctx,x,250,480,605,'rgba(255,255,255,.35)',18);
     text(ctx,group?'COLORADOS':'BLANCOS',x+24,274,432,30,{bold:true});
     const crop=group?[650,185,260,145]:[190,200,220,130];ctx.drawImage(assets.source,...crop,x+135,326,220,125);
     for(const [label,cx,width]of [['TIPO',x+20,80],['MAPLE',x+116,154],['CAJÓN',x+282,176]])text(ctx,label,cx,488,width,23,{bold:true});
     for(let i=0;i<3;i++){const row=rows[group*3+i],y=540+i*96;box(ctx,x+12,y,456,80,'rgba(255,255,255,.62)',10);text(ctx,row?.tipo_huevo||'—',x+24,y+25,78,30,{bold:true});text(ctx,row?money(row.precio_maple):'—',x+122,y+25,150,30,{bold:true});text(ctx,row?money(row.precio_cajon):'—',x+286,y+25,160,30,{bold:true});}
    }
    text(ctx,'Maple: 30 huevos · Cajón: 12 maples',48,882,984,24,{bold:true,color:'#733319'});
   }
   footer(ctx,region,branches,compact,page+1,chunks.length);return canvas;
  });
 }
 function money(value){return '$'+value.toLocaleString('es-AR',{maximumFractionDigits:2});}
 const api={WIDTH,HEIGHT,SCALE,PAGE_SIZE,pages,wrap,render};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SocialArtwork=api;
})(typeof globalThis!=='undefined'?globalThis:this);
