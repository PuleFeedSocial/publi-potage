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
