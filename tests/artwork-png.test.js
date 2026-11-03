const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
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
function render(kind,count=3,assets={},template){
 return social.render({
  canvasFactory:()=>createCanvas(1,1),
  kind,
  branches:branchesFor(count),
  rows:rowsFor(kind),
  assets,
  template
 });
}
async function realAssets(kind){
 return {
  logo:await loadImage(path.join(__dirname,'../img/icon-512.png')),
  source:await loadImage(path.join(__dirname,kind==='pollos'?'../img/precios/pollos.png':'../img/precios/costa.jpg'))
 };
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
 return {count,minX,maxX,center:x+(minX+maxX+1)/2};
}

test('the real PNG export is exactly 2240 x 1880 for eggs and chicken at every branch count',async()=>{
 const assets={huevos:await realAssets('huevos'),pollos:await realAssets('pollos')};
 for(const kind of ['huevos','pollos'])for(const count of [1,3,4,7]){
  const pages=render(kind,count,assets[kind]);
  assert.equal(pages.length,Math.ceil(count/6));
  for(const canvas of pages){
   assert.equal(canvas.width,2240);assert.equal(canvas.height,1880);
   assert.equal(canvas.width/canvas.height,2240/1880);
   assert.ok(Math.abs(canvas.width/canvas.height-1.1914893617)<1e-9);
   const buffer=canvas.toBuffer('image/png');
   assert.deepEqual(pngSize(buffer),{width:2240,height:1880});
   const verified=await social.verifyPngBlob(new Blob([buffer],{type:'image/png'}));
   assert.deepEqual({width:verified.width,height:verified.height,ratio:verified.ratio},{width:2240,height:1880,ratio:2240/1880});
  }
 }
});

test('company background templates also export real 2240 x 1880 PNGs for eggs and chicken',async()=>{
 const assets={huevos:await realAssets('huevos'),pollos:await realAssets('pollos')};
 const background=createCanvas(2240,1880);
 const context=background.getContext('2d');
 context.fillStyle='#f7e7c7';context.fillRect(0,0,2240,1880);
 context.fillStyle='#dfb560';context.fillRect(0,0,2240,40);
 for(const kind of ['huevos','pollos']){
  const [canvas]=render(kind,3,{...assets[kind],background},{layout:'artwork',showTitle:true,showBrand:false});
  assert.equal(canvas.width,2240);assert.equal(canvas.height,1880);
  const buffer=canvas.toBuffer('image/png');
  assert.deepEqual(pngSize(buffer),{width:2240,height:1880});
  const verified=await social.verifyPngBlob(new Blob([buffer],{type:'image/png'}));
  assert.equal(verified.ratio,2240/1880);
 }
});

test('the rendered title ink is centered across the full 2240 px canvas',()=>{
 for(const kind of ['huevos','pollos']){
  const [canvas]=render(kind);
  const ctx=canvas.getContext('2d');
  const top=inkBounds(ctx,400,80,1440,130,[0xf0,0x52,0x26]);
  const bottom=inkBounds(ctx,400,190,1440,170,[0xff,0x79,0x1e]);
  assert.ok(top.count>100,'title top is painted for '+kind);
  assert.ok(bottom.count>100,'title bottom is painted for '+kind);
  assert.ok(Math.abs(top.center-canvas.width/2)<=8,'title top center: '+top.center);
  assert.ok(Math.abs(bottom.center-canvas.width/2)<=8,'title bottom center: '+bottom.center);
 }
});

test('the download verifier rejects old 1080 square and 1440 x 1800 exports',async()=>{
 const [canvas]=render('huevos');
 const valid=new Blob([canvas.toBuffer('image/png')],{type:'image/png'});
 assert.equal((await social.verifyPngBlob(valid)).width,2240);
 const square=createCanvas(1080,1080);
 square.getContext('2d').fillStyle='#ffffff';square.getContext('2d').fillRect(0,0,1080,1080);
 await assert.rejects(
  social.verifyPngBlob(new Blob([square.toBuffer('image/png')],{type:'image/png'})),
  /1080 × 1080 px/
 );
 const vertical=createCanvas(1440,1800);
 vertical.getContext('2d').fillStyle='#ffffff';vertical.getContext('2d').fillRect(0,0,1440,1800);
 await assert.rejects(
  social.verifyPngBlob(new Blob([vertical.toBuffer('image/png')],{type:'image/png'})),
  /1440 × 1800 px/
 );
 await assert.rejects(
  social.verifyPngBlob(new Blob(['not a png'],{type:'image/png'})),
  /PNG válido/
 );
});

test('the on-site preview preserves 2240:1880 without cover cropping',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../productos.css'),'utf8');
 const rule=css.match(/#artwork-preview\{([^}]+)\}/);
 assert.ok(rule,'artwork preview rule exists');
 assert.match(rule[1],/aspect-ratio:2240\/1880/);
 assert.match(rule[1],/object-fit:contain/);
 assert.doesNotMatch(rule[1],/object-fit:cover/);
 assert.doesNotMatch(rule[1],/height:100%/);
});

test('generator sources no longer contain vertical or old export formats',()=>{
 for(const file of ['social-artwork.js','price-artwork-ui.js','company-templates.js','productos.html']){
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  assert.doesNotMatch(source,/1440\s*[×x]\s*1800/,file);
  assert.doesNotMatch(source,/1080\s*[×x]\s*1080/,file);
  assert.doesNotMatch(source,/\b4:5\b/,file);
  assert.doesNotMatch(source,/Formato vertical/i,file);
 }
});

test('the service worker ships a cache version that includes the new generator files',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
 const version=Number(source.match(/const CACHE = 'potage-v(\d+)'/)[1]);
 assert.ok(version>=89,'cache version: '+version);
 for(const file of ['/social-artwork.js','/price-artwork-ui.js','/company-templates.js'])assert.ok(source.includes("'"+file+"'"),file);
});
