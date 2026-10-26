const {test}=require('node:test');const assert=require('node:assert/strict');const {build}=require('../price-text');
function fixture(){return {regiones:[{region_id:'R1',nombre_region:'AMBA',activa:'Sí'},{region_id:'R2',nombre_region:'Costa',activa:'Sí'}],locales:[{region_id:'R1',local_id:'S1',nombre_local:'Merlo'},{region_id:'R1',local_id:'S2',nombre_local:'San Miguel'},{region_id:'R2',local_id:'S3',nombre_local:'Costa'}],regionProductos:[],huevos:[{region_id:'R1',lista_id:'GENERAL',tipo_huevo:'B1',categoria:'Estándar',precio_maple:4900,precio_cajon:58800},{region_id:'R1',lista_id:'GENERAL',tipo_huevo:'C EXTRA',categoria:'Especial',precio_maple:4000,precio_cajon:48000},{region_id:'R2',lista_id:'GENERAL',tipo_huevo:'B1',precio_maple:100,precio_cajon:1200}],carnes:[{region_id:'R1',producto:'Supremas',categoria:'Pollo',presentacion:'5 kg',precio:13000},{region_id:'R1',producto:'Supremas',categoria:'Pollo',presentacion:'15 kg',precio:37500}]};}
const directory=[{id:'S1',ubicacion:'Merlo',direccion:'Calle 1',horario:'Lunes a sábado 7 a 15',contacto:'123',activo:true},{id:'S2',ubicacion:'San Miguel',direccion:'Calle 2',horario:'Lunes a viernes 8 a 16',contacto:'456',activo:true}];
test('regional text uses real contacts, special units, independent meat prices and excludes other regions',()=>{
 const {text}=build(fixture(),directory,{region:'R1'});
 assert.ok(text.startsWith('🛒 NUESTROS PRECIOS MAYORISTAS Y MINORISTAS:\n\n🥚 Huevos B1 (Blancos)\n🔸 Maple (30 unidades): $4.900\n🔸 Cajón (12 maples): $58.800'));
 assert.ok(text.includes('Maple (20 unidades): $4.000'));assert.ok(text.includes('15 kg: $37.500'));assert.ok(text.includes('📍 Sede San Miguel'));assert.ok(text.includes('⏰ Horarios: Lunes a sábado 7 a 15'));assert.ok(!text.includes('$1.200'));
});
test('branch, search and product type filters are combined without leaking other addresses',()=>{
 const {text}=build(fixture(),directory,{region:'R1',branch:'S2',search:'b1',type:'huevos'});
 assert.ok(text.includes('📍 Sucursal San Miguel'));assert.ok(!text.includes('Merlo'));assert.ok(!text.includes('Pechuga'));assert.ok(!text.includes('C EXTRA'));
 assert.throws(()=>build(fixture(),directory,{region:'R1',branch:'S3'}),/no pertenece/);
});
test('missing prices are explicitly counted, zero retained, invalid prices and inconsistent crates blocked',()=>{
 const data=fixture();data.huevos[0].precio_maple='';data.huevos[0].precio_cajon='';assert.equal(build(data,directory,{region:'R1'}).omitted,1);
 data.huevos[0].precio_maple=0;data.huevos[0].precio_cajon=0;assert.ok(build(data,directory,{region:'R1'}).text.includes('$0'));
 data.huevos[0].precio_cajon=1;assert.throws(()=>build(data,directory,{region:'R1'}),/12 maples/);
 data.huevos[0].precio_maple='4900';assert.throws(()=>build(data,directory,{region:'R1'}),/inválidos/);
});
test('disabled categories, inactive branches and missing directory fields fail safely',()=>{
 const data=fixture();data.regionProductos=[{region_id:'R1',tipo:'huevos',activo:'No'}];assert.throws(()=>build(data,directory,{region:'R1',type:'huevos'}),/No hay productos/);
 assert.throws(()=>build(fixture(),[{...directory[0],horario:''}],{region:'R1',branch:'S1'}),/horario/);
 assert.throws(()=>build(fixture(),[{...directory[0],activo:false}],{region:'R1',branch:'S1'}),/activas/);
 assert.throws(()=>build(fixture(),[],{region:'R1'}),/vínculo/);
});
