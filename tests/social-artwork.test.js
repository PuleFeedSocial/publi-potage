const {test}=require('node:test');const assert=require('node:assert/strict');const social=require('../social-artwork');
function draw(count,kind='huevos',customBranches){
 const pages=[];
 const branches=customBranches||Array.from({length:count},(_,i)=>({ubicacion:'Sucursal '+i,direccion:'Avenida Ejemplo '+(1000+i),contacto:'+54 9 11 1234-'+String(i).padStart(4,'0')}));
 const factory=()=>{
  const calls=[],positions=[],scales=[];
  const ctx={font:'20px Arial',scale(...args){scales.push(args);},translate(){},rotate(){},rect(){},fillRect(){},beginPath(){},save(){},clip(){},restore(){},drawImage(){},
   measureText(s){return{width:String(s).length*(Number(this.font.match(/(\d+)px/)?.[1])||20)*.52};},
   fillText(value,x,y){
    const text=String(value),size=Number(this.font.match(/(\d+)px/)?.[1])||20;
    if(!['producción','propia'].includes(text)){
     const width=this.measureText(text).width,left=this.textAlign==='center'?x-width/2:this.textAlign==='right'?x-width:x;
     assert.ok(left>=0&&left+width<=social.WIDTH/social.SCALE,'horizontal bounds: '+text);
     assert.ok(y>=0&&y+size<=social.HEIGHT/social.SCALE,'vertical bounds: '+text);
    }
    calls.push(text);positions.push({text,x,y,size,align:this.textAlign});
   }};
  const canvas={getContext:()=>ctx};pages.push({canvas,calls,positions,scales});return canvas;
 };
 const rows=kind==='pollos'?Array.from({length:7},(_,i)=>({producto:'Pollo '+i,presentacion:'5 kg',precio:29000+i*1000})):Array.from({length:6},(_,i)=>({tipo_huevo:(i<3?'B':'C')+(i%3+1),precio_maple:4900,precio_cajon:58800}));
 const canvases=social.render({canvasFactory:factory,kind,region:'AMBA',branches,rows,assets:{logo:{},source:{}}});return {pages,canvases,branches};
}
test('feed exports use a native 1440 by 1800 4:5 canvas for eggs and chicken at every branch count',()=>{
 for(const kind of ['huevos','pollos'])for(const n of [1,3,4,6,7,18]){
  const {canvases,pages}=draw(n,kind);assert.equal(canvases.length,Math.ceil(n/6));
  for(const canvas of canvases){assert.equal(canvas.width,1440);assert.equal(canvas.height,1800);assert.equal(canvas.width/canvas.height,4/5);}
  for(const page of pages)assert.deepEqual(page.scales,[[4/3,4/3]]);
 }
});
test('the complete price heading is centered on the canvas for both product templates',()=>{
 for(const kind of ['huevos','pollos'])for(const page of draw(3,kind).pages)for(const title of ['LISTA DE','precios']){
  const position=page.positions.find(call=>call.text===title);assert.equal(position.x*social.SCALE,social.WIDTH/2);assert.equal(position.align,'center');
 }
});
test('up to three locations include addresses; compact pages preserve every location and phone without addresses',()=>{
 const full=draw(3);assert.ok(full.pages[0].calls.includes('Avenida Ejemplo 1000'));
 const compact=draw(7);const all=compact.pages.flatMap(page=>page.calls);
 for(let i=0;i<7;i++){assert.ok(all.includes('Sede Sucursal '+i));assert.ok(all.includes(compact.branches[i].contacto));assert.ok(!all.includes(compact.branches[i].direccion));}
});
test('long branch details fit inside the export rather than clipping the brand or footer',()=>{
 const branches=Array.from({length:3},()=>({ubicacion:'SAN MIGUEL CENTRO',direccion:'Av. Dr. Ricardo Balbín 2815, entre una calle y otra calle, Buenos Aires',contacto:'+54 9 11 2157-9792'}));
 assert.doesNotThrow(()=>draw(3,'huevos',branches));
});
test('administrative region names never appear in exported artwork',()=>{for(const page of draw(3).pages)assert.ok(!page.calls.some(text=>text.includes('AMBA')));});
