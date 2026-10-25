const {test}=require('node:test');
const assert=require('node:assert/strict');
const p=require('../services/products');
test('region editor saves fields and switches atomically and detects concurrent configuration edits',async()=>{
 const f=fixture(),batches=[];
 f.client.spreadsheets.get=async()=>({data:{sheets:Object.values(p.schemas).map((s,i)=>({properties:{title:s.tab,sheetId:i}}))}});
 f.client.spreadsheets.batchUpdate=async args=>batches.push(args.requestBody.requests);
 const row=(await p.read(f.client)).regiones[0];
 const payload={...row,nombre_region:'Costa',tipos:{huevos:true,pollos:false,cerdos:false,carnes:true},sucursales:[]};
 await p.saveRegion('PUT',payload,f.client);
 assert.equal(batches.length,1);
 const writes=batches[0].filter(r=>r.appendCells).map(r=>r.appendCells.rows[0].values.map(c=>c.userEnteredValue.stringValue));
 assert.deepEqual(writes,[['REG-01','huevos','Sí'],['REG-01','pollos','No'],['REG-01','cerdos','No'],['REG-01','carnes','Sí']]);
 assert.equal(batches[0].find(r=>r.updateCells?.start.sheetId===0).updateCells.rows[0].values[1].userEnteredValue.stringValue,'Costa');
 f.rows.regionProductos.push(['REG-01','pollos','No']);
 await assert.rejects(p.saveRegion('PUT',payload,f.client),{status:409});assert.equal(batches.length,1);
});
test('region deletion protects products and clears only region configuration and branch links',async()=>{
 const f=fixture(),batches=[];
 f.client.spreadsheets.get=async()=>({data:{sheets:Object.values(p.schemas).map((s,i)=>({properties:{title:s.tab,sheetId:i}}))}});
 f.client.spreadsheets.batchUpdate=async args=>batches.push(args.requestBody.requests);
 await assert.rejects(p.saveRegion('DELETE',(await p.read(f.client)).regiones[0],f.client),{status:409});
 f.rows.huevos.length=1;f.rows.regionProductos.push(['REG-01','huevos','Sí']);f.rows.locales.push(['SUC-1','Centro','REG-01']);
 await p.saveRegion('DELETE',(await p.read(f.client)).regiones[0],f.client);
 assert.equal(batches.length,1);assert.equal(batches[0].length,3);
 assert.deepEqual(batches[0].map(r=>r.repeatCell.range.sheetId),[0,4,1]);
});
test('new region validates branch ownership and creates optional config in the same batch',async(t)=>{
 const f=fixture(),batches=[];t.mock.method(require('../services/product-branches'),'read',async()=>[{id:'SUC-1',ubicacion:'Centro'}]);
 f.client.spreadsheets.get=async()=>({data:{sheets:Object.values(p.schemas).slice(0,4).map((s,i)=>({properties:{title:s.tab,sheetId:i}}))}});
 f.client.spreadsheets.batchUpdate=async args=>batches.push(args.requestBody.requests);
 const payload={region_id:'REG-NEW',nombre_region:'Nueva',activa:'Sí',tipos:{huevos:false,pollos:true,cerdos:false,carnes:false},sucursales:['SUC-1']};
 f.rows.locales.push(['SUC-1','Centro','REG-01']);
 await assert.rejects(p.saveRegion('POST',payload,f.client),{status:409});assert.equal(batches.length,0);
 f.rows.locales.length=1;await p.saveRegion('POST',payload,f.client);
 assert.equal(batches.length,1);assert.equal(batches[0][0].addSheet.properties.title,'Productos por región');
 assert.equal(batches[0].filter(r=>r.appendCells).length,6);
});
test('missing region configuration tab is created with headers on first valid save',async()=>{
 const f=fixture();let exists=false;let created=0;
 f.client.spreadsheets.get=async()=>({data:{sheets:exists?[{properties:{title:p.schemas.regionProductos.tab}}]:[]}});
 f.client.spreadsheets.values.batchGet=async({ranges})=>{
  if(ranges.length===5&&!exists)throw Object.assign(new Error('Missing range'),{code:400});
  return {data:{valueRanges:Object.values(f.rows).slice(0,ranges.length).map(values=>({values}))}};
 };
 f.client.spreadsheets.batchUpdate=async args=>{
  const requests=args.requestBody.requests;
  assert.equal(requests[0].addSheet.properties.title,'Productos por región');
  assert.deepEqual(requests[1].updateCells.rows[0].values.map(v=>v.userEnteredValue.stringValue),['region_id','tipo','activo']);
  exists=true;created++;
 };
 f.client.spreadsheets.values.get=async()=>({data:{values:[p.schemas.regionProductos.fields]}});
 assert.deepEqual((await p.read(f.client)).regionProductos,[]);assert.equal(created,0);
 await assert.rejects(p.write('regionProductos','POST',{region_id:'bad',tipo:'pollos',activo:'No'},f.client));assert.equal(created,0);
 await p.write('regionProductos','POST',{region_id:'REG-01',tipo:'pollos',activo:'No'},f.client);
 assert.equal(created,1);assert.deepEqual(f.calls[0].requestBody.values,[['REG-01','pollos','No']]);
 f.rows.regionProductos.push(['REG-01','pollos','No']);
 const row=(await p.read(f.client)).regionProductos[0];
 await p.write('regionProductos','PUT',{...row,activo:'Sí'},f.client);assert.equal(created,1);
 assert.equal(f.calls[1].requestBody.values[0][2],'Sí');
 await assert.rejects(p.write('regionProductos','PUT',{...row,_revision:'stale'},f.client),{status:409});
});
test('sheet permission errors never fall back to enabling all product types',async()=>{
 const f=fixture();let calls=0;
 f.client.spreadsheets.values.batchGet=async()=>{calls++;throw Object.assign(new Error('Denied'),{code:403});};
 await assert.rejects(p.read(f.client),{code:403});assert.equal(calls,1);
 assert.throws(()=>p.parse('regiones',[]),{status:409});
 assert.throws(()=>p.parse('regionProductos',[p.schemas.regionProductos.fields,['REG-01','pollo','Sí'],['REG-01','pollos','No']]),{status:409});
});
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
