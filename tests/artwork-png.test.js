const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createCanvas}=require('@napi-rs/canvas');
const social=require('../social-artwork');

const BRANCHES=[
 {ubicacion:'SAN MIGUEL CENTRO',direccion:'Av. Dr. Ricardo Balbín 2815, Buenos Aires',contacto:'+54 9 11 2157-9792'},
 {ubicacion:'MERLO',direccion:'Avenida Ejemplo 1000',contacto:'+54 9 11 1234-0000'},
 {ubicacion:'MORENO',direccion:'Avenida Ejemplo 2000',contacto:'+54 9 11 1234-0001'}
];
function rowsFor(kind){
 if(kind==='pollos')return Array.from({length:7},(_,i)=>({producto:'Pollo '+i,presentacion:'5 kg',precio:29000+i*1000}));
 return Array.from({length:6},(_,i)=>({tipo_huevo:(i<3?'B':'C')+(i%3+1),precio_maple:4900,precio_cajon:58800}));
}
function branchesFor(count){
 return Array.from({length:count},(_,i)=>BRANCHES[i]||{ubicacion:'SUCURSAL '+i,direccion:'Avenida Ejemplo '+(3000+i),contacto:'+54 9 11 1234-'+String(i).padStart(4,'0')});
}
function render(kind,count=3){
 return social.render({
  canvasFactory:()=>createCanvas(1,1),
  kind,
  branches:branchesFor(count),
  rows:rowsFor(kind),
  assets:{}
 });
}
function pngSize(buffer){
 assert.deepEqual([...buffer.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 return {width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};
}
function inkBounds(ctx,x,y,w,h,color,tolerance=3){
 const data=ctx.getImageData(x,y,w,h).data;
 let minX=Infinity,maxX=-1;let count=0;
 for(let py=0;py<h;py++)for(let px=0;px<w;px++){
  const i=(py*w+px)*4;
  if(Math.abs(data[i]-color[0])<=tolerance&&Math.abs(data[i+1]-color[1])<=tolerance&&Math.abs(data[i+2]-color[2])<=tolerance){
   minX=Math.min(minX,px);maxX=Math.max(maxX,px);count++;
  }
 }
 return {count,minX,maxX,center:(minX+maxX+1)/2};
}

test('the real PNG export is 1440 x 1800 (4:5) for eggs and chicken at every branch count',async()=>{
 for(const kind of ['huevos','pollos'])for(const count of [1,3,4,7]){
  const pages=render(kind,count);
  assert.equal(pages.length,Math.ceil(count/6));
  for(const canvas of pages){
   assert.equal(canvas.width,1440);assert.equal(canvas.height,1800);
   const buffer=canvas.toBuffer('image/png');
   assert.deepEqual(pngSize(buffer),{width:1440,height:1800});
   const verified=await social.verifyPngBlob(new Blob([buffer],{type:'image/png'}));
   assert.deepEqual({width:verified.width,height:verified.height,ratio:verified.ratio},{width:1440,height:1800,ratio:4/5});
  }
 }
});

test('company background templates also export real 1440 x 1800 PNGs for eggs and chicken',async()=>{
 const background=createCanvas(1080,1350);
 const context=background.getContext('2d');
 context.fillStyle='#f7e7c7';context.fillRect(0,0,1080,1350);
 for(const kind of ['huevos','pollos']){
  const [canvas]=social.render({
   canvasFactory:()=>createCanvas(1,1),
   kind,
   branches:branchesFor(3),
   rows:rowsFor(kind),
   assets:{background},
   template:{layout:'artwork',showTitle:true,showBrand:false}
  });
  assert.equal(canvas.width,1440);assert.equal(canvas.height,1800);
  const buffer=canvas.toBuffer('image/png');
  assert.deepEqual(pngSize(buffer),{width:1440,height:1800});
  assert.equal((await social.verifyPngBlob(new Blob([buffer],{type:'image/png'}))).ratio,4/5);
 }
});

test('the rendered title ink is centered across the full 1440 px canvas',()=>{
 for(const kind of ['huevos','pollos']){
  const [canvas]=render(kind);
  const ctx=canvas.getContext('2d');
  const top=inkBounds(ctx,0,0,canvas.width,220,[0xf0,0x52,0x26]);
  const bottom=inkBounds(ctx,0,100,canvas.width,240,[0xff,0x79,0x1e]);
  assert.ok(top.count>100,'title top is painted for '+kind);
  assert.ok(bottom.count>100,'title bottom is painted for '+kind);
  assert.ok(Math.abs(top.center-canvas.width/2)<=8,'title top center: '+top.center);
  assert.ok(Math.abs(bottom.center-canvas.width/2)<=8,'title bottom center: '+bottom.center);
 }
});

test('the download verifier rejects a square 1080 PNG and accepts only the 4:5 export',async()=>{
 const [canvas]=render('huevos');
 const valid=new Blob([canvas.toBuffer('image/png')],{type:'image/png'});
 assert.equal((await social.verifyPngBlob(valid)).width,1440);
 const square=createCanvas(1080,1080);
 square.getContext('2d').fillStyle='#ffffff';square.getContext('2d').fillRect(0,0,1080,1080);
 await assert.rejects(
  social.verifyPngBlob(new Blob([square.toBuffer('image/png')],{type:'image/png'})),
  /1080 × 1080 px/
 );
 await assert.rejects(
  social.verifyPngBlob(new Blob(['not a png'],{type:'image/png'})),
  /PNG válido/
 );
});

test('the on-site preview preserves 4:5 instead of forcing a square box',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../productos.css'),'utf8');
 const rule=css.match(/#artwork-preview\{([^}]+)\}/);
 assert.ok(rule,'artwork preview rule exists');
 assert.match(rule[1],/aspect-ratio:4\/5/);
 assert.match(rule[1],/object-fit:contain/);
 assert.doesNotMatch(rule[1],/height:100%/);
});

test('the service worker ships a cache version that includes the new generator files',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
 const version=Number(source.match(/const CACHE = 'potage-v(\d+)'/)[1]);
 assert.ok(version>=87,'cache version: '+version);
 for(const file of ['/social-artwork.js','/price-artwork-ui.js','/company-templates.js'])assert.ok(source.includes("'"+file+"'"),file);
});
