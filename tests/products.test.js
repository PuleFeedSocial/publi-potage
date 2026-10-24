const {test}=require('node:test');
const assert=require('node:assert/strict');
const p=require('../services/products');
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
 await p.write('huevos','PUT',{...item,precio_maple:50},f.client);
 assert.equal(f.calls[0].range,"'Precios huevos'!A2:K2");assert.equal(f.calls[0].valueInputOption,'RAW');assert.equal(f.calls[0].requestBody.values[0][7],50);
 f.rows.huevos[1][7]=500;
 await assert.rejects(p.write('huevos','PUT',item,f.client),{status:409});assert.equal(f.calls.length,1);
});
test('invalid and duplicate products cannot write to Sheets',async()=>{
 const f=fixture();const item=(await p.read(f.client)).huevos[0];
 for(const change of [{precio_maple:-1},{precio_maple:'100'},{precio_docena:10},{unidades_maple:0},{region_id:'NO-REGION'}])await assert.rejects(p.write('huevos','POST',{...item,...change},f.client));
 await assert.rejects(p.write('huevos','POST',item,f.client),{status:409});assert.equal(f.calls.length,0);
});
test('create and delete preserve other rows and prevent removal of populated regions',async()=>{
 const f=fixture();const all=await p.read(f.client);
 await assert.rejects(p.write('regiones','DELETE',all.regiones[0],f.client),{status:409});
 await p.write('locales','POST',{local_id:'L1',nombre_local:'=malicious()',region_id:'REG-01'},f.client);
 assert.equal(f.calls[0].valueInputOption,'RAW');assert.equal(f.calls[0].insertDataOption,'INSERT_ROWS');
 await p.write('huevos','DELETE',all.huevos[0],f.client);assert.equal(f.calls[1].range,"'Precios huevos'!A2:K2");
});
test('modified headers, duplicate keys and invalid table names fail safely',async()=>{
 const f=fixture();f.rows.regiones.push(['REG-01','Duplicada','Sí']);await assert.rejects(p.read(f.client),{status:409});
 f.rows.regiones.pop();f.rows.huevos[0]=['wrong'];await assert.rejects(p.read(f.client),{status:409});
 await assert.rejects(p.write('__proto__','POST',{},f.client),{status:400});assert.equal(f.calls.length,0);
});
