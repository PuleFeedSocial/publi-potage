(function(root){
 const WIDTH=2240,HEIGHT=1880,SCALE=1,PAGE_SIZE=6;
 const ASPECT_RATIO=WIDTH/HEIGHT;
 // La referencia de huevos mide 940 x 788 y la de pollos 884 x 661. Cada
 // plantilla se dibuja en su propio espacio de diseño y se escala de forma
 // uniforme; nunca se estira la imagen original.
 const EGG_DESIGN={width:940,height:789};
 // La plantilla entregada por El Triángulo es horizontal y conserva su
 // ilustración, cinta y marca. Sólo se sustituyen precios y datos dinámicos.
 const TRIANGLE_DESIGN={width:768,height:646};
 const CHICKEN_DESIGN={width:884,height:742};
 const SAFE_MARGIN=32,SAFE_MARGIN_PX=SAFE_MARGIN*SCALE;
 const FORMAT_LABEL='2240 × 1880 px · Horizontal 1.19:1';
 const PNG_SIGNATURE=[137,80,78,71,13,10,26,10];
 const BRAND_FONT='"Arial Rounded MT Bold", "Arial Black", Arial';
 const SCRIPT_FONT='"Brush Script MT", "Segoe Script", cursive';
 const DEFAULT_COLORS={
  pageEggs:'#ffdf6e',pageChicken:'#fdd9a3',
  eggPanel:'#feeba6',eggText:'#24180e',
  tableHead:'#fdd69b',tableRow:'#fff3e3',
  title:'#e45122',titleAccent:'#f07a1e',
  tagline:'#ffffff',taglineText:'#cf4b28',
  brand:'#ee5126',
  footerTitle:'#a84219',branchName:'#df5620',branchText:'#6e3b20',
  divider:'#e59c55',note:'#8a4b24',eggFootnote:'#8a4b24',
  chickenLabel:'#943b1d',chickenHead:'#f3bf85',chickenRow:'#fff0d5',
  chickenLine:'#e97843',chickenText:'#392719'
 };
 // Zonas para plantillas de fondo de empresas. Sólo se usan cuando existe
 // img/plantillas/<empresa>/fondo.*; el diseño estándar no depende de ellas.
 const DEFAULT_ZONES={
  eggs:{x:76,y:420,w:2088,h:940},
  chicken:{x:76,y:420,w:2088,h:940},
  branches:{x:76,y:1320,w:2088,h:430},
  brand:{x:1460,y:1400,w:650,h:330}
 };
 // Área que ocupa cada bloque dentro del diseño de referencia. Permite
 // reutilizar una plantilla con fondo sin deformar los bloques.
 const BLOCK_BOUNDS={
  eggsTables:{x:32,y:344,w:896,h:272},
  chickenTable:{x:414,y:147,w:431,h:477},
  eggsBranches:{x:32,y:636,w:896,h:146},
  chickenBranches:{x:0,y:640,w:884,h:102},
  brand:{x:610,y:645,w:313,h:130}
 };
 function normalizeTemplate(template){
  const source=template||{};
  return {
   brand:source.brand||'Potage',
   subtitle:source.subtitle===undefined?'— S.R.L. —':source.subtitle,
   titleTop:source.titleTop||'LISTA DE',
   titleBottom:source.titleBottom||'precios',
   chickenTitle:source.chickenTitle||'Lista de precios',
   verticalLabel:source.verticalLabel===undefined?'Nuevo ingreso!':source.verticalLabel,
   tagline:Array.isArray(source.tagline)?source.tagline:['producción','propia'],
   footerTitle:source.footerTitle||'ENCONTRANOS EN NUESTRAS SUCURSALES',
   footnote:source.footnote===undefined?'Precios sujetos a disponibilidad de stock':source.footnote,
   layout:source.layout||'auto',
   showBrand:source.showBrand===true,
   showTitle:source.showTitle===true,
   logoOnly:source.logoOnly===true,
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
   if(!word)continue;
   if(ctx.measureText((line?line+' ':'')+word).width<=width){line+=(line?' ':'')+word;continue;}
   if(line){result.push(line);line='';}
   for(const char of word){if(ctx.measureText(line+char).width>width){result.push(line);line='';}line+=char;}
  }
  if(line)result.push(line);return result;
 }
 function font(size,{bold=false,italic=false,family='Arial'}={}){
  return (italic?'italic ':'')+(bold?'700 ':'')+size+'px '+family;
 }
 function text(ctx,value,x,y,width,size=28,{bold=false,italic=false,color='#382719',align='left',family='Arial',baseline='top',minSize=8}={}){
  const valueText=String(value);
  let current=size;
  do{ctx.font=font(current,{bold,italic,family});if(ctx.measureText(valueText).width<=width||current<=minSize)break;current--;}while(true);
  if(ctx.measureText(valueText).width>width)throw Error('El texto es demasiado largo para publicar: '+valueText);
  ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline=baseline;
  ctx.fillText(valueText,x,y);return current;
 }
 // Ajusta un párrafo a una cantidad máxima de líneas. Devuelve el tamaño
 // elegido y las líneas ya medidas; si no entra, informa el dato a corregir.
 function fitParagraph(ctx,value,width,{maxLines=1,maxSize=24,minSize=12,bold=false,italic=false,family='Arial'}={}){
  const valueText=String(value||'').trim();
  for(let size=maxSize;size>=minSize;size--){
   ctx.font=font(size,{bold,italic,family});
   const lines=wrap(ctx,valueText,width);
   if(lines.length<=maxLines)return{size,lines,lineHeight:Math.round(size*1.18)};
  }
  throw Error('La información es demasiado extensa para publicar: '+valueText);
 }
 function box(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
 function roundRect(ctx,x,y,w,h,r){
  const radius=Math.max(0,Math.min(r,w/2,h/2));
  if(typeof ctx.quadraticCurveTo!=='function'){ctx.rect(x,y,w,h);return;}
  ctx.beginPath();
  ctx.moveTo(x+radius,y);
  ctx.lineTo(x+w-radius,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+radius);
  ctx.lineTo(x+w,y+h-radius);
  ctx.quadraticCurveTo(x+w,y+h,x+w-radius,y+h);
  ctx.lineTo(x+radius,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-radius);
  ctx.lineTo(x,y+radius);
  ctx.quadraticCurveTo(x,y,x+radius,y);
  ctx.closePath();
 }
 function fillRoundRect(ctx,x,y,w,h,r,color){ctx.fillStyle=color;roundRect(ctx,x,y,w,h,r);ctx.fill();}
 function line(ctx,x1,y1,x2,y2,color,width=1){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
 }
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
  const [sx,sy,sw,sh]=crop;const scale=Math.min(w/sw,h/sh),dw=sw*scale,dh=sh*scale;
  ctx.drawImage(image,sx,sy,sw,sh,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
 }
 function drawPin(ctx,x,y,size,color){
  const cx=x+size/2,cy=y+size*.42,r=size*.34;
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(cx,y+size);
  ctx.bezierCurveTo(cx-r*1.25,cy+r*.85,cx-r*1.05,cy-r*.2,cx,cy-r*.45);
  ctx.bezierCurveTo(cx+r*1.05,cy-r*.2,cx+r*1.25,cy+r*.85,cx,y+size);
  ctx.closePath();ctx.fill();
  ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(cx,cy,r*.36,0,Math.PI*2);ctx.fill();
 }
 function drawPhoneBadge(ctx,x,y,size){
  const cx=x+size/2,cy=y+size/2;
  ctx.fillStyle='#25d366';ctx.beginPath();ctx.arc(cx,cy,size/2,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.translate(cx,cy);ctx.rotate(-.62);ctx.fillStyle='#ffffff';
  roundRect(ctx,-size*.1,-size*.31,size*.2,size*.62,size*.1);ctx.fill();ctx.restore();
  ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(cx-size*.2,cy+size*.19,size*.055,0,Math.PI*2);ctx.fill();
 }
 function drawBrand(ctx,logo,theme,{x,y,icon,wordSize,subtitleSize,wordWidth,italic=false}){
  const logoX=x,logoY=y;
  if(logo&&(logo.naturalWidth||logo.width))contain(ctx,logo,logoX,logoY,icon,icon);
  const textX=logo?x+icon+10:x;
  const wordY=y+icon*.22;
  let current=wordSize;
  do{ctx.font=font(current,{bold:true,family:BRAND_FONT});if(ctx.measureText(theme.brand).width<=wordWidth||current<=12)break;current--;}while(true);
  ctx.fillStyle=theme.colors.brand;ctx.textAlign='left';ctx.textBaseline='top';
  ctx.fillText(theme.brand,textX,wordY);
  const measured=ctx.measureText(theme.brand).width;
  const sub=String(theme.subtitle||'').replace(/^[—–-]+\s*|\s*[—–-]+$/g,'').trim();
  if(sub){
   const subY=y+icon*.68;
   const subSize=Math.max(8,subtitleSize||Math.round(current*.3));
   ctx.font=font(subSize,{bold:true,family:'Arial'});
   const subWidth=ctx.measureText(sub).width;
   const center=textX+wordWidth/2;
   ctx.fillStyle=theme.colors.brand;ctx.textAlign='center';ctx.textBaseline='top';
   ctx.fillText(sub,center,subY);
   const lineY=subY+subSize*.52;
   const leftEnd=center-subWidth/2-8,rightStart=center+subWidth/2+8;
   if(leftEnd>textX+6)line(ctx,textX,lineY,leftEnd,lineY,theme.colors.brand,1.6);
   if(rightStart<textX+wordWidth-6)line(ctx,rightStart,lineY,textX+wordWidth,lineY,theme.colors.brand,1.6);
  }
 }
 function drawEggRibbon(ctx,theme){
  ctx.save();ctx.beginPath();ctx.moveTo(0,84);ctx.lineTo(84,0);ctx.lineTo(188,0);ctx.lineTo(0,188);ctx.closePath();
  ctx.fillStyle=theme.colors.tagline;ctx.fill();ctx.clip();
  ctx.translate(0,190);ctx.rotate(-Math.PI/4);
  const lines=theme.tagline.slice(0,2);
  ctx.fillStyle=theme.colors.taglineText;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=font(24,{family:'Arial'});
  if(lines[0])ctx.fillText(lines[0],134,-42);
  if(lines[1])ctx.fillText(lines[1],134,-12);
  ctx.restore();
 }
 function drawChickenRibbon(ctx,theme){
  ctx.save();ctx.beginPath();ctx.moveTo(756,0);ctx.lineTo(884,0);ctx.lineTo(884,128);ctx.closePath();
  ctx.fillStyle=theme.colors.tagline;ctx.fill();ctx.clip();
  ctx.translate(832,47);ctx.rotate(Math.PI/4);
  const lines=theme.tagline.slice(0,2);
  ctx.fillStyle=theme.colors.taglineText;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=font(15,{family:'Arial'});
  if(lines[0])ctx.fillText(lines[0],0,-10);
  if(lines[1])ctx.fillText(lines[1],0,10);
  ctx.restore();
 }
 function drawEggTitle(ctx,theme){
  text(ctx,theme.titleTop,470,44,430,55,{align:'center',color:theme.colors.title,family:'Georgia'});
  text(ctx,theme.titleBottom,470,93,380,84,{align:'center',color:theme.colors.titleAccent,family:SCRIPT_FONT});
 }
 function drawChickenTitle(ctx,theme){
  text(ctx,theme.chickenTitle,800,36,390,49,{align:'right',italic:true,color:theme.colors.title,family:'Georgia'});
 }
 function eggColumns(group){
  return group?[[496,127],[637,126],[778,138]]:[[42,124],[181,126],[324,135]];
 }
 function drawEggTable(ctx,group,rows,theme){
  const columns=eggColumns(group),headerY=344,rowY=[416,488,560];
  ['TAMAÑO','MAPLE','CAJÓN'].forEach((label,index)=>{
   const [x,w]=columns[index];
   fillRoundRect(ctx,x,headerY,w,56,8,theme.colors.tableHead);
   text(ctx,label,x+w/2,headerY+17,w-12,23,{bold:true,align:'center',color:theme.colors.eggText});
  });
  for(let i=0;i<3;i++){
   const row=rows[group*3+i];
   const labels=[row?.tipo_huevo||'—',row&&typeof row.precio_maple==='number'?money(row.precio_maple):'—',row&&typeof row.precio_cajon==='number'?money(row.precio_cajon):'—'];
   labels.forEach((label,index)=>{
    const [x,w]=columns[index];
    fillRoundRect(ctx,x,rowY[i],w,56,8,theme.colors.tableRow);
    text(ctx,label,x+w/2,rowY[i]+14,w-12,27,{bold:true,align:'center',color:theme.colors.eggText});
   });
  }
 }
 function drawEggTables(ctx,rows,theme){
  drawEggTable(ctx,0,rows,theme);drawEggTable(ctx,1,rows,theme);
 }
 function drawEggPanel(ctx,group,rows,source,custom,theme){
  const x=group?488:32,w=group?440:436;
  box(ctx,x,180,w,450,theme.colors.eggPanel);
  text(ctx,'Huevos',x+16,222,200,33,{color:theme.colors.eggText});
  text(ctx,group?'colorados':'blancos',x+16,268,200,33,{color:theme.colors.eggText});
  if(source&&(source.naturalWidth||source.width)){
   if(custom){
    if(group)contain(ctx,source,660,185,258,145);else contain(ctx,source,190,200,220,130);
   }else if(group)cropContain(ctx,source,[660,185,258,145],660,185,258,145);
   else cropContain(ctx,source,[190,200,220,130],190,200,220,130);
  }
  drawEggTable(ctx,group,rows,theme);
 }
 function drawEggPanels(ctx,rows,source,custom,theme){
  drawEggPanel(ctx,0,rows,source,custom,theme);drawEggPanel(ctx,1,rows,source,custom,theme);
 }
 function drawEggFooter(ctx,branches,compact,page,total,theme){
  if(!branches.length)return;
  const colors=theme.colors;
  if(compact){
   const start=648,rowH=20;
   branches.slice(0,6).forEach((branch,index)=>{
    const y=start+index*rowH;
    drawPin(ctx,32,y+1,15,colors.branchName);
    text(ctx,'Sede '+branch.ubicacion,51,y+1,260,15,{bold:true,color:colors.branchName,minSize:10});
    ctx.font=font(14,{bold:true,family:'Arial'});
    const phoneX=326;
    text(ctx,branch.contacto,phoneX,y+2,270,14,{bold:true,color:colors.branchName,minSize:10});
   });
  }else if(branches.length===1){
   const branch=branches[0];
   drawPin(ctx,32,700,29,colors.branchName);
   const fit=fitParagraph(ctx,branch.direccion,510,{maxLines:2,maxSize:26,minSize:14,bold:true});
   let y=696;
   for(const addressLine of fit.lines){text(ctx,addressLine,74,y,510,fit.size,{bold:true,color:colors.branchName,minSize:12});y+=fit.lineHeight;}
   y+=2;
   drawPhoneBadge(ctx,74,y,20);
   text(ctx,branch.contacto,102,y+1,420,19,{bold:true,color:colors.branchName,minSize:11});
  }else{
   const start=642,rowH=Math.floor(136/branches.length);
   branches.slice(0,3).forEach((branch,index)=>{
    const top=start+index*rowH;
    drawPin(ctx,32,top+2,21,colors.branchName);
    const address=fitParagraph(ctx,branch.direccion,474,{maxLines:2,maxSize:19,minSize:12,bold:true});
    let y=top;
    for(const addressLine of address.lines){text(ctx,addressLine,62,y,474,address.size,{bold:true,color:colors.branchName,minSize:10});y+=address.lineHeight;}
    drawPhoneBadge(ctx,62,y+1,15);
    text(ctx,branch.contacto,81,y+2,360,14,{bold:true,color:colors.branchName,minSize:9});
   });
  }
  if(total>1)text(ctx,page+' / '+total,930,776,100,9,{align:'right',color:colors.note,minSize:8});
 }
 function drawEggBrand(ctx,logo,theme){
  if(theme.logoOnly&&logo){contain(ctx,logo,610,645,313,130);return;}
  drawBrand(ctx,logo,theme,{x:610,y:645,icon:120,wordSize:52,subtitleSize:15,wordWidth:187});
 }
 function drawEggDesign(ctx,branches,rows,assets,theme,page,total,compact){
  box(ctx,0,0,EGG_DESIGN.width,EGG_DESIGN.height,theme.colors.pageEggs);
  drawEggRibbon(ctx,theme);
  drawEggTitle(ctx,theme);
  drawEggPanels(ctx,rows,assets.source,assets.sourceCustom,theme);
  drawEggFooter(ctx,branches,compact,page,total,theme);
  drawEggBrand(ctx,assets.logo,theme);
 }
 function triangleColumns(group){
  return group?[[407,104],[523,104],[638,113]]:[[31,104],[147,104],[262,113]];
 }
 function drawTriangleEggTable(ctx,group,rows,theme){
  const columns=triangleColumns(group),headerY=281,rowY=[340,399,457],headerH=47,rowH=47;
  ['TAMAÑO','MAPLE','CAJÓN'].forEach((label,index)=>{
   const [x,w]=columns[index];box(ctx,x,headerY,w,headerH,theme.colors.tableHead);
   text(ctx,label,x+w/2,headerY+15,w-8,17,{bold:true,align:'center',color:theme.colors.eggText,minSize:10});
  });
  for(let rowIndex=0;rowIndex<3;rowIndex++){
   const row=rows[group*3+rowIndex];
   const labels=[row?.tipo_huevo||'—',row&&typeof row.precio_maple==='number'?money(row.precio_maple):'—',row&&typeof row.precio_cajon==='number'?money(row.precio_cajon):'—'];
   labels.forEach((label,index)=>{
    const [x,w]=columns[index];box(ctx,x,rowY[rowIndex],w,rowH,theme.colors.tableRow);
    text(ctx,label,x+w/2,rowY[rowIndex]+13,w-8,20,{bold:true,align:'center',color:theme.colors.eggText,minSize:11});
   });
  }
 }
 function drawTriangleFooter(ctx,branches,compact,page,total,theme){
  const colors=theme.colors;
  // Quita la dirección impresa de la foto original para que nunca quede
  // información fija de otra sucursal debajo de los datos actuales.
  box(ctx,22,529,724,102,colors.pageEggs);
  if(compact){
   const columns=2,rowH=25;
   branches.slice(0,6).forEach((branch,index)=>{
    const col=Math.floor(index/3),row=index%3,x=28+col*365,y=542+row*rowH;
    text(ctx,'Sede '+branch.ubicacion,x,y,200,13,{bold:true,color:colors.branchName,minSize:9});
    text(ctx,branch.contacto,x+205,y,145,12,{bold:true,color:colors.branchName,minSize:8});
   });
  }else{
   const shown=branches.slice(0,3),columns=shown.length===1?1:shown.length,colW=704/columns;
   shown.forEach((branch,index)=>{
    const x=32+index*colW;
    const name=fitParagraph(ctx,'Sede '+branch.ubicacion,colW-14,{maxLines:1,maxSize:16,minSize:10,bold:true});
    let y=543;text(ctx,name.lines[0],x,y,colW-14,name.size,{bold:true,color:colors.branchName,minSize:9});y+=name.lineHeight;
    const address=fitParagraph(ctx,branch.direccion,colW-14,{maxLines:2,maxSize:12,minSize:8,bold:false});
    address.lines.forEach(lineText=>{text(ctx,lineText,x,y,colW-14,address.size,{color:colors.branchText,minSize:8});y+=address.lineHeight;});
    text(ctx,branch.contacto,x,y+1,colW-14,12,{bold:true,color:colors.branchName,minSize:8});
   });
  }
  text(ctx,theme.footnote,24,626,360,9,{color:colors.note,minSize:7});
  if(total>1)text(ctx,page+' / '+total,740,626,20,8,{align:'right',color:colors.note,minSize:7});
 }
 function drawTriangleEggDesign(ctx,branches,rows,assets,theme,page,total,compact){
  box(ctx,0,0,TRIANGLE_DESIGN.width,TRIANGLE_DESIGN.height,theme.colors.pageEggs);
  if(assets.source&&(assets.source.naturalWidth||assets.source.width))ctx.drawImage(assets.source,0,0,TRIANGLE_DESIGN.width,TRIANGLE_DESIGN.height);
  drawTriangleEggTable(ctx,0,rows,theme);drawTriangleEggTable(ctx,1,rows,theme);
  drawTriangleFooter(ctx,branches,compact,page,total,theme);
 }
 function drawChickenHorizontalLabel(ctx,theme){
  if(!theme.verticalLabel)return;
  ctx.save();ctx.translate(64,552);ctx.rotate(-Math.PI/2);
  ctx.fillStyle=theme.colors.title;ctx.textAlign='left';ctx.textBaseline='top';ctx.font=font(48,{italic:true,family:'Georgia'});
  ctx.fillText(theme.verticalLabel,0,0);ctx.restore();
 }
 function drawChickenImage(ctx,source,custom,theme){
  if(!source||!(source.naturalWidth||source.width))return;
  if(custom)contain(ctx,source,92,145,300,486);
  else cropContain(ctx,source,[122,153,230,415],110,145,267,481);
 }
 function drawChickenTable(ctx,rows,theme){
  const x=414,w=431,priceX=650,top=147,headerH=28,rowH=64,bottom=top+headerH+rowH*7;
  const lineColor=theme.colors.chickenLine;
  for(const y of [top,top+headerH,bottom])line(ctx,x,y,x+w,y,lineColor,1);
  for(let i=1;i<7;i++)line(ctx,x,top+headerH+i*rowH,x+w,top+headerH+i*rowH,lineColor,1);
  line(ctx,x,top,x,bottom,lineColor,1);line(ctx,priceX,top,priceX,bottom,lineColor,1);line(ctx,x+w,top,x+w,bottom,lineColor,1);
  text(ctx,'PRECIO',(priceX+x+w)/2,top+8,120,12,{bold:true,align:'center',color:theme.colors.chickenText,minSize:9});
  rows.slice(0,7).forEach((row,index)=>{
   const centerY=top+headerH+rowH*index+rowH/2;
   const label=row.producto+' x '+row.presentacion;
   text(ctx,label,x+9,centerY-12,priceX-x-24,22,{family:'Georgia',color:theme.colors.chickenText,minSize:14});
   text(ctx,money(row.precio)+'.-',x+w-10,centerY-12,x+w-priceX-22,22,{align:'right',family:'Georgia',color:theme.colors.chickenText,minSize:13});
  });
 }
 function drawChickenFooter(ctx,branches,compact,page,total,theme){
  if(!branches.length)return;
  const colors=theme.colors;
  if(compact){
   const columns=2,rows=Math.ceil(branches.length/columns),lineH=23,start=650;
   const colW=420;
   branches.slice(0,6).forEach((branch,index)=>{
    const col=Math.floor(index/3),row=index%3;
    const x=20+col*colW,y=start+row*lineH;
    drawPin(ctx,x,y,14,colors.branchName);
    text(ctx,'Sede '+branch.ubicacion,x+18,y+1,190,13.5,{bold:true,color:colors.branchName,minSize:9});
    text(ctx,branch.contacto,x+210,y+2,195,13,{bold:true,color:colors.branchName,minSize:9});
   });
  }else if(branches.length===1){
   const branch=branches[0];
   const address=fitParagraph(ctx,branch.direccion,620,{maxLines:1,maxSize:22,minSize:13,bold:true});
   const phoneSize=18,phoneWidth=170;
   const totalWidth=30+address.lines[0].length*0+ctx.measureText(address.lines[0]).width+18+22+phoneWidth;
   const fits=totalWidth<=820;
   if(fits){
    const groupWidth=30+ctx.measureText(address.lines[0]).width+18+22+8+ctx.measureText(branch.contacto).width;
    let x=Math.max(24,(CHICKEN_DESIGN.width-groupWidth)/2);
    drawPin(ctx,x,664,22,colors.branchName);
    text(ctx,address.lines[0],x+31,662,520,address.size,{bold:true,color:colors.branchName,minSize:12});
    const phoneX=x+31+ctx.measureText(address.lines[0]).width+16;
    drawPhoneBadge(ctx,phoneX,663,20);
    text(ctx,branch.contacto,phoneX+26,663,220,phoneSize,{bold:true,color:colors.branchName,minSize:10});
   }else{
    const address2=fitParagraph(ctx,branch.direccion,760,{maxLines:2,maxSize:22,minSize:13,bold:true});
    let y=650;
    for(const addressLine of address2.lines){text(ctx,addressLine,CHICKEN_DESIGN.width/2,y,760,address2.size,{align:'center',bold:true,color:colors.branchName,minSize:12});y+=address2.lineHeight;}
    drawPhoneBadge(ctx,CHICKEN_DESIGN.width/2-90,y,19);
    text(ctx,branch.contacto,CHICKEN_DESIGN.width/2-66,y+1,220,17,{bold:true,color:colors.branchName,minSize:10});
   }
  }else{
   const start=650,rowH=32;
   branches.slice(0,3).forEach((branch,index)=>{
    const y=start+index*rowH;
    const fit=fitParagraph(ctx,branch.direccion+'  ·  '+branch.contacto,790,{maxLines:1,maxSize:17,minSize:10,bold:true});
    const groupWidth=25+ctx.measureText(fit.lines[0]).width;
    const x=Math.max(20,(CHICKEN_DESIGN.width-groupWidth)/2);
    drawPin(ctx,x,y,19,colors.branchName);
    text(ctx,fit.lines[0],x+26,y,790,fit.size,{bold:true,color:colors.branchName,minSize:9});
   });
  }
  if(total>1)text(ctx,page+' / '+total,864,724,100,9,{align:'right',color:colors.note,minSize:8});
 }
 function drawChickenBrand(ctx,logo,theme){
  if(theme.logoOnly&&logo){contain(ctx,logo,62,20,312,103);return;}
  drawBrand(ctx,logo,theme,{x:62,y:20,icon:103,wordSize:48,subtitleSize:14,wordWidth:190});
 }
 function drawChickenDesign(ctx,branches,rows,assets,theme,page,total,compact){
  box(ctx,0,0,CHICKEN_DESIGN.width,CHICKEN_DESIGN.height,theme.colors.pageChicken);
  drawChickenRibbon(ctx,theme);
  drawChickenBrand(ctx,assets.logo,theme);
  drawChickenTitle(ctx,theme);
  drawChickenHorizontalLabel(ctx,theme);
  drawChickenImage(ctx,assets.source,assets.sourceCustom,theme);
  drawChickenTable(ctx,rows,theme);
  drawChickenFooter(ctx,branches,compact,page,total,theme);
 }
 // Título de respaldo cuando una plantilla con fondo pide que lo dibujemos.
 function drawFinalTitle(ctx,kind,theme){
  if(kind==='pollos'){
   text(ctx,theme.chickenTitle,WIDTH-96,80,780,118,{align:'right',italic:true,color:theme.colors.title,family:'Georgia'});
  }else{
   text(ctx,theme.titleTop,WIDTH/2,86,1100,112,{align:'center',color:theme.colors.title,family:'Georgia'});
   text(ctx,theme.titleBottom,WIDTH/2,204,850,150,{align:'center',color:theme.colors.titleAccent,family:SCRIPT_FONT});
  }
 }
 function renderDefault(ctx,kind,branches,rows,assets,theme,page,total,compact){
  if(kind==='pollos'){
   const scale=WIDTH/CHICKEN_DESIGN.width;
   ctx.save();ctx.scale(scale,scale);
   drawChickenDesign(ctx,branches,rows,assets,theme,page,total,compact);
   ctx.restore();
  }else{
   const scale=WIDTH/EGG_DESIGN.width;
   ctx.save();ctx.scale(scale,scale);
   drawEggDesign(ctx,branches,rows,assets,theme,page,total,compact);
   ctx.restore();
  }
 }
 function renderTriangle(ctx,kind,branches,rows,assets,theme,page,total,compact){
  if(kind!=='huevos')return renderDefault(ctx,kind,branches,rows,assets,theme,page,total,compact);
  const scale=Math.min(WIDTH/TRIANGLE_DESIGN.width,HEIGHT/TRIANGLE_DESIGN.height);
  const offsetX=(WIDTH-TRIANGLE_DESIGN.width*scale)/2;
  ctx.save();ctx.translate(offsetX,0);ctx.scale(scale,scale);
  drawTriangleEggDesign(ctx,branches,rows,assets,theme,page,total,compact);
  ctx.restore();
 }
 // Renderiza un bloque de precio dentro de una zona de una plantilla con fondo,
 // sin deformarlo y sin agregar tarjetas que tapen el diseño original.
 function placeBlock(ctx,zone,bounds,draw){
  if(!zone||!bounds)return;
  const scale=Math.min(zone.w/bounds.w,zone.h/bounds.h);
  const ox=zone.x+(zone.w-bounds.w*scale)/2,oy=zone.y+(zone.h-bounds.h*scale)/2;
  ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);ctx.translate(-bounds.x,-bounds.y);draw();ctx.restore();
 }
 function renderArtwork(ctx,kind,branches,rows,assets,theme,page,total,compact){
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,WIDTH,HEIGHT);
  cover(ctx,assets.background,0,0,WIDTH,HEIGHT,false);
  if(theme.showTitle)drawFinalTitle(ctx,kind,theme);
  if(kind==='pollos'){
   placeBlock(ctx,theme.zones.chicken,BLOCK_BOUNDS.chickenTable,()=>drawChickenTable(ctx,rows,theme));
   placeBlock(ctx,theme.zones.branches,BLOCK_BOUNDS.chickenBranches,()=>drawChickenFooter(ctx,branches,compact,page,total,theme));
  }else{
   placeBlock(ctx,theme.zones.eggs,BLOCK_BOUNDS.eggsTables,()=>drawEggTables(ctx,rows,theme));
   placeBlock(ctx,theme.zones.branches,BLOCK_BOUNDS.eggsBranches,()=>drawEggFooter(ctx,branches,compact,page,total,theme));
  }
  if(theme.showBrand)placeBlock(ctx,theme.zones.brand,BLOCK_BOUNDS.brand,()=>drawEggBrand(ctx,assets.logo,theme));
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
  if(theme.layout==='el-triangulo')renderTriangle(ctx,kind,chunk,rows,assets,theme,index+1,chunks.length,compact);
  else if(useBackground)renderArtwork(ctx,kind,chunk,rows,assets,theme,index+1,chunks.length,compact);
  else renderDefault(ctx,kind,chunk,rows,assets,theme,index+1,chunks.length,compact);
   if(canvas.width!==WIDTH||canvas.height!==HEIGHT)throw Error('El lienzo cambió de tamaño durante el dibujo.');
   return canvas;
  });
 }
 function money(value){return '$'+Number(value).toLocaleString('es-AR',{maximumFractionDigits:2});}
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
 const api={WIDTH,HEIGHT,SCALE,ASPECT_RATIO,SAFE_MARGIN,SAFE_MARGIN_PX,PAGE_SIZE,FORMAT_LABEL,EGG_DESIGN,TRIANGLE_DESIGN,CHICKEN_DESIGN,DEFAULT_ZONES,BLOCK_BOUNDS,pages,wrap,render,pngDimensions,verifyPngBlob};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SocialArtwork=api;
 })(typeof globalThis!=='undefined'?globalThis:this);
