const {test}=require('node:test');
const assert=require('node:assert/strict');
const artwork=require('../price-artwork');
function fixture(){return {regiones:[{region_id:'A',activa:'Sí'},{region_id:'C',activa:'Sí'}],regionProductos:[],huevos:['A','C'].flatMap(region_id=>['B1','B2','B3','C1','C2','C3'].map(tipo_huevo=>({region_id,tipo_huevo,lista_id:'GENERAL',categoria:'Estándar',precio_maple:region_id==='A'?4900:4700,precio_cajon:region_id==='A'?58800:56400}))) };}
test('artwork reads only selected region standard eggs and separates Costa white/color rows',()=>{
 const data=fixture();assert.equal(artwork.rows(data,'A',artwork.templates.amba.defaults)[0].precio_maple,4900);
 const costa=artwork.rows(data,'C',artwork.templates.costa.defaults);assert.equal(costa.length,6);assert.equal(costa[3].tipo_huevo,'C1');assert.equal(costa[0].precio_maple,4700);
 data.huevos.push({...data.huevos[0],tipo_huevo:'EXTRA',categoria:'Especial'});assert.equal(artwork.candidates(data,'A').length,6);
});
test('artwork rejects missing, repeated, inactive, unavailable and inconsistent prices',()=>{
 for(const mutate of [d=>d.huevos[0].precio_maple='',d=>d.huevos[0].precio_cajon=147000,d=>d.huevos[0].precio_maple=NaN,d=>d.regiones[0].activa='No',d=>d.regionProductos.push({region_id:'A',tipo:'huevos',activo:'No'})]){const data=fixture();mutate(data);assert.throws(()=>artwork.rows(data,'A',['B1','B2','B3']));}
 assert.throws(()=>artwork.rows(fixture(),'A',['B1','B1','B2']));assert.throws(()=>artwork.rows(fixture(),'A',['B1','','B3']));
 const zero=fixture();zero.huevos[0].precio_maple=0;zero.huevos[0].precio_cajon=0;assert.equal(artwork.rows(zero,'A',['B1'])[0].precio_cajon,0);
});
test('regional contact footer uses linked active branches and rejects stale or incomplete contacts',()=>{
 const data=fixture();data.locales=[{region_id:'A',local_id:'1',nombre_local:'Merlo'},{region_id:'A',local_id:'2',nombre_local:'Centro'},{region_id:'C',local_id:'3',nombre_local:'Costa'}];
 const directory=[{id:'1',ubicacion:'Merlo',direccion:'Balbín 3039',contacto:'111',activo:true},{id:'2',ubicacion:'Centro',direccion:'Calle 1',contacto:'222',activo:false},{id:'3',ubicacion:'Costa',direccion:'Alfonsín 1216',contacto:'333',activo:true}];
 assert.deepEqual(artwork.branches(data,'A',directory).map(b=>b.id),['1']);
 assert.deepEqual(artwork.branches(data,'C',directory).map(b=>b.id),['3']);
 assert.throws(()=>artwork.branches(data,'A',directory.slice(1)),/vinculación/);
 assert.throws(()=>artwork.branches(data,'A',directory.map(b=>({...b,contacto:''}))),/Completá/);
 assert.throws(()=>artwork.branches(data,'A',directory.map(b=>({...b,activo:false}))),/activas/);
 assert.throws(()=>artwork.branches(data,'OTHER',directory),/Vinculá/);
});
test('regional template allows explicitly empty slots but never all empty or missing selected prices',()=>{
 const data=fixture();assert.equal(artwork.rows(data,'A',['B1','',''],{allowEmpty:true})[1],null);
 assert.throws(()=>artwork.rows(data,'A',['','',''],{allowEmpty:true}));
 data.huevos[0].precio_cajon='';assert.throws(()=>artwork.rows(data,'A',['B1','',''],{allowEmpty:true}));
});
