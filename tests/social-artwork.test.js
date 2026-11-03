const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const social=require('../social-artwork');

function fakeContext(){
 let matrix=[1,0,0,1,0,0];
 const stack=[];
 const calls=[],positions=[],scales=[];
 const apply=(x,y)=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]];
 const ctx={
  font:'20px Arial',textAlign:'left',textBaseline:'top',fillStyle:'#000',strokeStyle:'#000',lineWidth:1,
  save(){stack.push([...matrix]);},
  restore(){if(stack.length)matrix=stack.pop();},
  translate(x,y){matrix[4]+=matrix[0]*x+matrix[2]*y;matrix[5]+=matrix[1]*x+matrix[3]*y;},
  scale(x,y){scales.push([x,y]);matrix[0]*=x;matrix[1]*=x;matrix[2]*=y;matrix[3]*=y;},
  rotate(angle){const c=Math.cos(angle),s=Math.sin(angle),a=matrix[0],b=matrix[1],d=matrix[2],e=matrix[3];matrix[0]=a*c+d*s;matrix[1]=b*c+e*s;matrix[2]=-a*s+d*c;matrix[3]=-b*s+e*c;},
  measureText(value){const size=Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1])||20;return{width:String(value).length*size*.52};},
  fillText(value,x,y){
   const text=String(value),size=Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1])||20;
   const [fx,fy]=apply(x,y),scale=Math.hypot(matrix[0],matrix[1]);
   const width=this.measureText(text).width*scale;
   const left=this.textAlign==='center'?fx-width/2:this.textAlign==='right'?fx-width:fx;
   const top=this.textBaseline==='middle'?fy-(size*scale)/2:fy;
   assert.ok(fx>=-1&&fx<=social.WIDTH+1,'text x inside canvas: '+text);
   assert.ok(fy>=-1&&fy<=social.HEIGHT+1,'text y inside canvas: '+text);
   calls.push(text);positions.push({text,x:fx,y:fy,size:size*scale,align:this.textAlign,left,top,width});
  },
  beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},bezierCurveTo(){},arc(){},closePath(){},rect(){},clip(){},
  fill(){},stroke(){},fillRect(){},drawImage(){}
 };
 return {ctx,calls,positions,scales};
}
function draw(count,kind='huevos',customBranches,options={}){
 const pages=[];
 const branches=customBranches||Array.from({length:count},(_,i)=>({ubicacion:'Sucursal '+i,direccion:'Avenida Ejemplo '+(1000+i),contacto:'+54 9 11 1234-'+String(i).padStart(4,'0')}));
 const factory=()=>{
  const fake=fakeContext();const canvas={getContext:()=>fake.ctx};
  pages.push({canvas,...fake});return canvas;
 };
 const rows=kind==='pollos'?Array.from({length:7},(_,i)=>({producto:'Pollo '+i,presentacion:'5 kg',precio:29000+i*1000})):Array.from({length:6},(_,i)=>({tipo_huevo:(i<3?'B':'C')+(i%3+1),precio_maple:4900,precio_cajon:58800}));
 const canvases=social.render({canvasFactory:factory,kind,region:'AMBA',branches,rows,assets:{logo:{},source:{},...(options.assets||{})},template:options.template});return {pages,canvases,branches};
}
test('feed exports use a native 2240 by 1880 horizontal canvas for eggs and chicken at every branch count',()=>{
 for(const kind of ['huevos','pollos'])for(const n of [1,3,4,6,7,18]){
  const {canvases}=draw(n,kind);assert.equal(canvases.length,Math.ceil(n/6));
  for(const canvas of canvases){assert.equal(canvas.width,2240);assert.equal(canvas.height,1880);assert.equal(canvas.width/canvas.height,2240/1880);}
 }
});
test('the huevos heading is centered on the canvas and the pollos heading stays in its original right-hand position',()=>{
 const eggs=draw(3,'huevos').pages[0];
 for(const title of ['LISTA DE','precios']){
  const position=eggs.positions.find(call=>call.text===title);
  assert.equal(position.align,'center');assert.ok(Math.abs(position.x-social.WIDTH/2)<.01,'centered '+title);
 }
 const chicken=draw(3,'pollos').pages[0];
 const title=chicken.positions.find(call=>call.text==='Lista de precios');
 assert.equal(title.align,'right');assert.ok(title.x>social.WIDTH*.8,'chicken title on the right');
});
test('the original decorations survive: diagonal production ribbon, white and colored egg blocks and chicken label',()=>{
 const eggs=draw(3,'huevos').pages[0];
 for(const value of ['producción','propia','Huevos','blancos','colorados','TAMAÑO','MAPLE','CAJÓN'])assert.ok(eggs.calls.includes(value),value);
 const chicken=draw(3,'pollos').pages[0];
 for(const value of ['producción','propia','Lista de precios','Nuevo ingreso!','PRECIO'])assert.ok(chicken.calls.includes(value),value);
});
test('up to three locations include addresses and phones; compact pages preserve every location and phone without addresses',()=>{
 const full=draw(3);const fullCalls=full.pages[0].calls;
 assert.ok(fullCalls.includes('Avenida Ejemplo 1000'));assert.ok(fullCalls.includes(full.branches[0].contacto));
 const compact=draw(7);const all=compact.pages.flatMap(page=>page.calls);
 for(let i=0;i<7;i++){assert.ok(all.includes('Sede Sucursal '+i));assert.ok(all.includes(compact.branches[i].contacto));assert.ok(!all.includes(compact.branches[i].direccion));}
});
test('long branch details fit inside the export rather than clipping the brand or footer',()=>{
 const branches=Array.from({length:3},()=>({ubicacion:'SAN MIGUEL CENTRO',direccion:'Av. Dr. Ricardo Balbín 2815, entre una calle y otra calle, Buenos Aires',contacto:'+54 9 11 2157-9792'}));
 assert.doesNotThrow(()=>draw(3,'huevos',branches));
});
test('administrative region names never appear in exported artwork',()=>{for(const page of draw(3).pages)assert.ok(!page.calls.some(text=>text.includes('AMBA')));});
test('company templates replace the wordmark without changing the branch rule',()=>{
 const {pages}=draw(3,'huevos',undefined,{template:{brand:'Pluma Blanca',subtitle:'— S.R.L. —'}});
 assert.ok(pages[0].calls.includes('Pluma Blanca'));
 assert.ok(!pages[0].calls.includes('Potage'));
 assert.ok(pages[0].calls.includes('Avenida Ejemplo 1000'));
});
test('a company background switches to the artwork layout and keeps prices and contacts',()=>{
 const {pages}=draw(3,'huevos',undefined,{template:{showTitle:false,showBrand:false},assets:{background:{width:2240,height:1880}}});
 assert.ok(!pages[0].calls.includes('LISTA DE'));
 assert.ok(pages[0].calls.includes('Avenida Ejemplo 1000'));
 assert.ok(pages[0].calls.includes('B1'));
});
test('El Triángulo artwork keeps the selected branch and replaces the reference prices',()=>{
 const branch={ubicacion:'LA PLATA',direccion:'Boulevard 81 Nº 436',contacto:'+54 9 221 555-0101'};
 const {pages}=draw(1,'huevos',[branch],{template:{layout:'el-triangulo'}});
 const calls=pages[0].calls;
 assert.ok(calls.includes('Sede LA PLATA'));
 assert.ok(calls.includes('Boulevard 81 Nº 436'));
 assert.ok(calls.includes('+54 9 221 555-0101'));
 assert.ok(calls.includes('$4.900'));
});
test('the product generator exposes only the horizontal 2240 by 1880 export',()=>{
 assert.equal(social.WIDTH,2240);assert.equal(social.HEIGHT,1880);
 assert.equal(social.ASPECT_RATIO,2240/1880);assert.equal(social.WIDTH/social.HEIGHT,2240/1880);
 for(const file of ['social-artwork.js','price-artwork-ui.js']){
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  assert.doesNotMatch(source,/WIDTH\s*=\s*1080\s*,\s*HEIGHT\s*=\s*1080/,file);
  assert.doesNotMatch(source,/canvas\.width\s*=\s*1080[\s\S]{0,80}canvas\.height\s*=\s*1080/,file);
  assert.doesNotMatch(source,/1080\s*[×x]\s*1080/,file);
  assert.doesNotMatch(source,/1440\s*[×x]\s*1800/,file);
 }
 const ui=fs.readFileSync(path.join(__dirname,'..','price-artwork-ui.js'),'utf8');
 assert.match(ui,/SocialArtwork\.verifyPngBlob\(blob\)/);
 assert.doesNotMatch(ui,/toDataURL/);
});
