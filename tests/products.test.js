const {test}=require('node:test');
const assert=require('node:assert/strict');
const p=require('../services/products');
test('region flags accept spreadsheet booleans and blank defaults without reactivating explicit No',()=>{
 for(const value of ['',true,'SI','sí',' Activa ',1])assert.equal(p.activeValue(value),'Sí');
 for(const value of [false,'No','FALSE',0,'inactiva'])assert.equal(p.activeValue(value),'No');
 assert.equal(p.activeValue('tal vez'),'Revisar');
});
test('legacy 30-maple crates display 12 and save using the original revision',async()=>{
 for(const category of ['Estándar','Especial']){
  const f=fixture();Object.assign(f.rows.huevos[1],{3:category,6:category==='Especial'?'':1960,7:4900,9:147000});
  const item=(await p.read(f.client)).huevos[0];
  assert.equal(item.precio_cajon,58800);assert.equal(item._needsPriceSave,true);assert.equal(f.calls.length,0);
  await p.write('huevos','PUT',{...item,price_source:'precio_maple'},f.client);
  assert.equal(f.calls[0].requestBody.values[0][9],58800);
  f.rows.huevos[1][9]=60000;
  assert.equal((await p.read(f.client)).huevos[0]._needsPriceSave,undefined);
 }
});
test('branch associations use the directory identity, reject invented branches and allow legacy relinking',async(t)=>{
 t.mock.method(require('../services/product-branches'),'read',async()=>[{id:'SUC-1',ubicacion:'Centro'}]);
 const f=fixture();
 await assert.rejects(p.write('locales','POST',{region_id:'REG-01',local_id:'fake',nombre_local:'fake'},f.client));
 await assert.rejects(p.write('locales','POST',{region_id:'REG-01',sucursal_id:'fake'},f.client));
 assert.equal(f.calls.length,0);
 f.rows.locales.push(['OLD','Centro viejo','REG-01']);
 const row=(await p.read(f.client)).locales[0];
 await p.write('locales','PUT',{...row,sucursal_id:'SUC-1',nombre_local:'Inventado'},f.client);
 assert.deepEqual(f.calls[0].requestBody.values[0],['SUC-1','Centro','REG-01']);
 f.rows.locales.push(['SUC-1','Centro','REG-01']);
 await assert.rejects(p.write('locales','POST',{region_id:'REG-01',sucursal_id:'SUC-1'},f.client),{status:409});
});
function fixture(){
 const rows=Object.fromEntries(Object.entries(p.schemas).map(([k,s])=>[k,[s.fields]]));
 rows.regiones.push(['REG-01','AMBA','Sí']);
 rows.huevos.push(['REG-01','GENERAL','B EXTRA','Especial','Maple 20',20,'',0,'',1200,'']);
 const calls=[];
 const client={spreadsheets:{values:{
  async batchGet(){return {data:{valueRanges:Object.values(rows).map(values=>({values}))}};},
  async update(args){calls.push(args);},async clear(args){calls.push(args);},async append(args){calls.push(args);}
 }}};
 return {rows,calls,client};
}
test('product reads retain zero, blanks, special quantities and ignore region instructions',async()=>{
 const f=fixture();f.rows.regiones.push([],['CÓMO COMPLETAR LA BASE'],['1. Conservá los códigos']);
 const data=await p.read(f.client);assert.equal(data.regiones.length,1);assert.equal(data.huevos[0].precio_maple,0);assert.equal(data.huevos[0].precio_docena,'');assert.equal(data.huevos[0].unidades_maple,20);
});
test('product update targets only its row, uses RAW and rejects stale revisions',async()=>{
 const f=fixture();const item=(await p.read(f.client)).huevos[0];
 await p.write('huevos','PUT',{...item,precio_maple:50,price_source:'precio_maple'},f.client);
 assert.equal(f.calls[0].range,"'Precios huevos'!A2:K2");assert.equal(f.calls[0].valueInputOption,'RAW');assert.equal(f.calls[0].requestBody.values[0][7],50);
 f.rows.huevos[1][7]=500;
 await assert.rejects(p.write('huevos','PUT',item,f.client),{status:409});assert.equal(f.calls.length,1);
});
test('invalid and duplicate products cannot write to Sheets',async()=>{
 const f=fixture();const item=(await p.read(f.client)).huevos[0];
 for(const change of [{precio_maple:-1},{precio_maple:'100'},{precio_docena:10},{unidades_maple:0},{region_id:'NO-REGION'}])await assert.rejects(p.write('huevos','POST',{...item,...change},f.client));
 await assert.rejects(p.write('huevos','POST',{...item,price_source:'precio_maple'},f.client),{status:409});assert.equal(f.calls.length,0);
});
test('create and delete preserve other rows and prevent removal of populated regions',async(t)=>{
 t.mock.method(require('../services/product-branches'),'read',async()=>[{id:'SUC-1',ubicacion:'=malicious()'}]);
 const f=fixture();const all=await p.read(f.client);
 await assert.rejects(p.write('regiones','DELETE',all.regiones[0],f.client),{status:409});
 await p.write('locales','POST',{sucursal_id:'SUC-1',region_id:'REG-01'},f.client);
 assert.equal(f.calls[0].valueInputOption,'RAW');assert.equal(f.calls[0].insertDataOption,'INSERT_ROWS');
 await p.write('huevos','DELETE',all.huevos[0],f.client);assert.equal(f.calls[1].range,"'Precios huevos'!A2:K2");
});
test('modified headers, duplicate keys and invalid table names fail safely',async()=>{
 const f=fixture();f.rows.regiones.push(['REG-01','Duplicada','Sí']);await assert.rejects(p.read(f.client),{status:409});
 f.rows.regiones.pop();f.rows.huevos[0]=['wrong'];await assert.rejects(p.read(f.client),{status:409});
 await assert.rejects(p.write('__proto__','POST',{},f.client),{status:400});assert.equal(f.calls.length,0);
});
test('meat presentations keep independent prices and writes affect only the chosen row',async()=>{
 const f=fixture();
 f.rows.carnes.push(['REG-01','PC-01','Pollo','Cuartos traseros','5 kg',13000],['REG-01','PC-02','Pollo','Cuartos traseros','15 kg',37500]);
 const item=(await p.read(f.client)).carnes[0];
 await p.write('carnes','PUT',{...item,precio:14000},f.client);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].range,"'Precios pollos y carnes'!A2:F2");
 assert.equal(f.calls[0].requestBody.values[0][5],14000);assert.equal(f.rows.carnes[2][5],37500);
 await p.write('carnes','POST',{region_id:'REG-01',producto_id:'PC-03',categoria:'Pollo',producto:'Cuartos traseros',presentacion:'10 kg',precio:25000},f.client);
 assert.equal(f.calls[1].requestBody.values[0][5],25000);
});
