const { google } = require('googleapis');
const crypto = require('crypto');
const eggPrices = require('../egg-prices');
const SPREADSHEET_ID = process.env.PRODUCTS_SHEET_ID || '1hFGIgLe4YgF2Iz5V7wJQcE0tS3tXlKvDtEwKduSEUtg';
const schemas = {
  regiones: { tab: 'Regiones', fields: ['region_id','nombre_region','activa'], key: ['region_id'] },
  locales: { tab: 'Locales', fields: ['local_id','nombre_local','region_id'], key: ['local_id'] },
  huevos: { tab: 'Precios huevos', fields: ['region_id','lista_id','tipo_huevo','categoria','presentacion_maple','unidades_maple','precio_docena','precio_maple','precio_medio_cajon','precio_cajon','cambio_por_docena'], key: ['region_id','lista_id','tipo_huevo'] },
  carnes: { tab: 'Precios pollos y carnes', fields: ['region_id','producto_id','categoria','producto','presentacion','precio'], key: ['region_id','producto_id'] },
  regionProductos: { tab: 'Productos por región', fields: ['region_id','tipo','activo'], key: ['region_id','tipo'] }
};
const PRODUCT_TYPES = ['huevos','pollos','cerdos','carnes'];
function fail(message, status=400) { return Object.assign(new Error(message), { status, publicMessage: message }); }
function credentials() {
  try { return JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}'); }
  catch { throw fail('La configuración de Google Sheets no es válida.',503); }
}
function connection() { return { email: credentials().client_email || null, spreadsheetId: SPREADSHEET_ID }; }
let client;
function getClient() {
  if (client) return client;
  const c=credentials();
  if (!c.client_email || !c.private_key) throw fail('Falta configurar GOOGLE_CREDENTIALS en Render.',503);
  client=google.sheets({version:'v4',auth:new google.auth.GoogleAuth({credentials:c,scopes:['https://www.googleapis.com/auth/spreadsheets']}),timeout:15000,retry:false});
  return client;
}
function revision(cells) { return crypto.createHash('sha256').update(JSON.stringify(cells)).digest('hex'); }
function rowKey(schema, row) { return JSON.stringify(schema.key.map(k=>String(row[k]||'').trim().toLowerCase())); }
function activeValue(value){
 const text=String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(['no','false','0','inactiva','inactivo'].includes(text))return 'No';
 if(['','si','true','1','activa','activo'].includes(text))return 'Sí';
 return 'Revisar';
}
function parse(kind, values=[]) {
  const schema=schemas[kind];
  if (kind==='regionProductos' && (!Array.isArray(values) || !values.length)) return [];
  if (!schema.fields.every((f,i)=>values[0]?.[i]===f)) throw fail(`Revisá los encabezados de la pestaña ${schema.tab}.`,409);
  const seen=new Set();
  return values.slice(1).flatMap((cells,index)=>{
    // The template contains instructions below the Regions table.
    if (!cells || !cells[0] || (kind==='regiones' && !/^[A-Za-z0-9_-]{1,80}$/.test(String(cells[0])))) return [];
    const row=Object.fromEntries(schema.fields.map((f,i)=>[f,cells[i]??'']));
    const hash=revision(schema.fields.map(f=>row[f]));
    if(kind==='regionProductos'){
      row.tipo=normalizeProductType(row.tipo);
      if(!row.tipo)throw fail('Hay un tipo desconocido en Productos por región.',409);
    }
    const key=rowKey(schema,row);
    if(seen.has(key)) throw fail(`Hay registros duplicados en ${schema.tab}. Corregilos en la hoja antes de continuar.`,409);
    seen.add(key);
    if(kind==='regiones')row.activa=activeValue(row.activa);
    if(kind==='regionProductos')row.activo=activeValue(row.activo);
    // Recognize only the former exact 30-maple conversion, never arbitrary price differences.
    if(kind==='huevos'&&row.lista_id==='GENERAL'&&typeof row.precio_maple==='number'&&row.precio_maple>0&&Math.abs(row.precio_cajon-row.precio_maple*30)<0.011){
      row._previousCrate=row.precio_cajon;row.precio_cajon=eggPrices.calculate('precio_maple',row.precio_maple,row.categoria).precio_cajon;row._needsPriceSave=true;
    }
    return [{...row,_row:index+2,_revision:hash}];
  });
}
async function read(client=getClient()) {
  const ranges=Object.values(schemas).map(s=>`'${s.tab}'!A1:${String.fromCharCode(64+s.fields.length)}10000`);
  let result;
  try {
    result=await client.spreadsheets.values.batchGet({spreadsheetId:SPREADSHEET_ID,ranges,valueRenderOption:'UNFORMATTED_VALUE'});
  } catch (err) {
    // Only a verified missing optional tab may be treated as empty configuration.
    if(Number(err.code||err.response?.status)!==400)throw err;
    const metadata=await client.spreadsheets.get({spreadsheetId:SPREADSHEET_ID,fields:'sheets.properties.title'});
    if(metadata.data.sheets?.some(s=>s.properties.title===schemas.regionProductos.tab))throw err;
    const partialRanges=ranges.slice(0,-1);
    result=await client.spreadsheets.values.batchGet({spreadsheetId:SPREADSHEET_ID,ranges:partialRanges,valueRenderOption:'UNFORMATTED_VALUE'});
    const valuesRanges=result.data.valueRanges||[];
    valuesRanges.push({values:[]});
    result={data:{valueRanges:valuesRanges}};
  }
  const data=Object.fromEntries(Object.keys(schemas).map((k,i)=>[k,parse(k,result.data.valueRanges?.[i]?.values)]));
  if(!data.regionProductos)data.regionProductos=[];
  for(const region of data.regiones)region._configRevision=regionRevision(data,region.region_id);
  return data;
}
function regionRevision(all,id){
  return revision(['regiones','regionProductos','locales'].map(kind=>all[kind].filter(r=>r.region_id===id).map(r=>[r._row,r._revision])));
}
function saveRegion(method,input,client){
  const task=queue.then(()=>saveRegionNow(method,input,client));queue=task.catch(()=>{});return task;
}
async function saveRegionNow(method,input,client=getClient()){
  const all=await read(client),current=all.regiones.find(r=>r.region_id===input.region_id);
  if(method==='POST'&&all.regiones.some(r=>String(r.region_id).toLowerCase()===String(input.region_id).toLowerCase()))throw fail('Esta región ya existe.',409);
  if(method!=='POST'&&(!current||input._configRevision!==current._configRevision))throw fail('La región cambió. Actualizá los datos antes de guardar.',409);
  const configs=all.regionProductos.filter(r=>r.region_id===input.region_id),links=all.locales.filter(r=>r.region_id===input.region_id);
  let region,selected=[];
  if(method==='DELETE'){
    if(['huevos','carnes'].some(k=>all[k].some(r=>r.region_id===input.region_id)))throw fail('La región tiene productos. Desactivala o eliminá sus productos antes de borrar la región.',409);
  }else{
    region=validate('regiones',input,all);
    if(!input.tipos||!PRODUCT_TYPES.every(t=>typeof input.tipos[t]==='boolean'))throw fail('Elegí los tipos de productos de la región.');
    if(!Array.isArray(input.sucursales)||input.sucursales.length>500||input.sucursales.some(id=>typeof id!=='string')||new Set(input.sucursales).size!==input.sucursales.length)throw fail('Revisá la selección de sucursales.');
    // Only consult the directory when assigning a new branch. Existing links remain usable if it is temporarily unavailable.
    const newIds=input.sucursales.filter(id=>!links.some(r=>r.local_id===id));
    const directory=newIds.length?await require('./product-branches').read():[];
    selected=input.sucursales.map(id=>{
      if(all.locales.some(r=>r.local_id===id&&r.region_id!==input.region_id))throw fail('Una sucursal seleccionada ya pertenece a otra región. Actualizá los datos.',409);
      const old=links.find(r=>r.local_id===id);if(old)return old;
      const matches=directory.filter(b=>b.id===id);if(matches.length!==1)throw fail('Una sucursal ya no existe o está duplicada. Actualizá los datos.',409);
      return validate('locales',{local_id:id,nombre_local:matches[0].ubicacion,region_id:region.region_id},{...all,regiones:[...all.regiones,region]});
    });
  }
  const metadata=await client.spreadsheets.get({spreadsheetId:SPREADSHEET_ID,fields:'sheets.properties'});
  const ids=Object.fromEntries((metadata.data.sheets||[]).map(s=>[s.properties.title,s.properties.sheetId]));
  const requests=[];
  const cells=values=>({values:values.map(v=>({userEnteredValue:{stringValue:String(v)}}))});
  for(const kind of ['regiones','locales'])if(ids[schemas[kind].tab]===undefined)throw fail('Faltan pestañas del catálogo.',409);
  if(method!=='DELETE'&&ids[schemas.regionProductos.tab]===undefined){
    const sheetId=crypto.randomInt(1,2147483647);ids[schemas.regionProductos.tab]=sheetId;
    requests.push({addSheet:{properties:{sheetId,title:schemas.regionProductos.tab}}});
    requests.push({updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows:[cells(schemas.regionProductos.fields)],fields:'userEnteredValue'}});
  }else if(method!=='DELETE'&&!all.regionProductos.length){
    requests.push({updateCells:{start:{sheetId:ids[schemas.regionProductos.tab],rowIndex:0,columnIndex:0},rows:[cells(schemas.regionProductos.fields)],fields:'userEnteredValue'}});
  }
  const put=(kind,row,old)=>{
    const sheetId=ids[schemas[kind].tab],rows=[cells(schemas[kind].fields.map(f=>row[f]))];
    requests.push(old?{updateCells:{start:{sheetId,rowIndex:old._row-1,columnIndex:0},rows,fields:'userEnteredValue'}}:{appendCells:{sheetId,rows,fields:'userEnteredValue'}});
  };
  const clear=(kind,row)=>requests.push({repeatCell:{range:{sheetId:ids[schemas[kind].tab],startRowIndex:row._row-1,endRowIndex:row._row,startColumnIndex:0,endColumnIndex:schemas[kind].fields.length},cell:{},fields:'userEnteredValue'}});
  if(method==='DELETE'){
    clear('regiones',current);configs.forEach(r=>clear('regionProductos',r));links.forEach(r=>clear('locales',r));
  }else{
    put('regiones',region,current);
    for(const tipo of PRODUCT_TYPES)put('regionProductos',{region_id:region.region_id,tipo,activo:input.tipos[tipo]?'Sí':'No'},configs.find(r=>r.tipo===tipo));
    for(const row of selected)if(!links.some(r=>r.local_id===row.local_id))put('locales',row);
    for(const row of links)if(!selected.some(r=>r.local_id===row.local_id))clear('locales',row);
  }
  await client.spreadsheets.batchUpdate({spreadsheetId:SPREADSHEET_ID,requestBody:{requests}});
}
async function ensureRegionProductsSheet(client){
  const schema=schemas.regionProductos;
  const metadata=await client.spreadsheets.get({spreadsheetId:SPREADSHEET_ID,fields:'sheets.properties'});
  const sheet=metadata.data.sheets?.find(s=>s.properties.title===schema.tab);
  if(!sheet){
    const sheetId=crypto.randomInt(1,2147483647);
    await client.spreadsheets.batchUpdate({spreadsheetId:SPREADSHEET_ID,requestBody:{requests:[
      {addSheet:{properties:{sheetId,title:schema.tab}}},
      {updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows:[{values:schema.fields.map(text=>({userEnteredValue:{stringValue:text}}))}],fields:'userEnteredValue'}}
    ]}});
    return;
  }
  const header=await client.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:"'Productos por región'!A1:C1"});
  if(!header.data.values?.length){
    // read() already verified that this tab is completely empty.
    await client.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range:"'Productos por región'!A1:C1",valueInputOption:'RAW',requestBody:{values:[schema.fields]}});
  }else if(!schema.fields.every((f,i)=>header.data.values[0][i]===f))throw fail('Revisá los encabezados de Productos por región.',409);
}
function normalizeProductType(value){
  const text=String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(text==='huevos'||text==='huevo')return 'huevos';
  if(text==='pollos'||text==='pollo')return 'pollos';
  if(text==='cerdos'||text==='cerdo'||text==='porcinos')return 'cerdos';
  if(text==='carnes'||text==='carne'||text==='otros')return 'carnes';
  return null;
}
function validate(kind, input, all) {
  const schema=schemas[kind]; const row={};
  if(kind==='regiones')input={...input,activa:activeValue(input.activa)};
  if(kind==='regionProductos'){input={...input,tipo:normalizeProductType(input.tipo)||String(input.tipo||'').trim().toLowerCase(),activo:activeValue(input.activo)};}
  for(const field of schema.fields) {
    const value=input[field]??'';
    if(field.startsWith('precio') || field==='cambio_por_docena' || field==='unidades_maple') {
      if(value==='') {row[field]='';continue;}
      if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e10) throw fail('Ingresá importes válidos, sin símbolos ni separadores de miles.');
      if(field==='unidades_maple'&&(!Number.isInteger(value)||value<1||value>1000)) throw fail('La cantidad del maple debe ser un entero entre 1 y 1000.');
      row[field]=value;
    } else {
      if(typeof value!=='string'||value.length>200) throw fail('Hay un campo de texto inválido o demasiado largo.');
      row[field]=value.trim();
    }
  }
  for(const key of schema.key) if(!row[key]) throw fail('Completá los campos obligatorios.');
  for(const field of ['region_id','local_id','producto_id']) if(row[field]&&!/^[A-Za-z0-9_-]{1,80}$/.test(row[field])) throw fail('Los códigos admiten letras, números, guiones y guiones bajos.');
  if(kind!=='regiones'&&!all.regiones.some(r=>r.region_id===row.region_id)) throw fail('La región no existe.');
  if(kind==='regiones'&&(!row.nombre_region||!['Sí','No'].includes(row.activa))) throw fail('Indicá el nombre y estado de la región.');
  if(kind==='locales'&&!row.nombre_local) throw fail('Indicá el nombre de la sucursal.');
  if(kind==='carnes'&&(!row.producto||!row.categoria)) throw fail('Indicá producto y categoría.');
  if(kind==='regionProductos'){if(!PRODUCT_TYPES.includes(row.tipo))throw fail('Tipo de producto inválido.');if(!['Sí','No'].includes(row.activo))throw fail('Indicá si está activo.');}
  if(kind==='huevos') {
    if(!['Estándar','Especial'].includes(row.categoria)||!row.presentacion_maple) throw fail('Indicá la categoría y presentación del maple.');
    if(row.categoria==='Especial'&&(row.unidades_maple===''||row.precio_docena!=='')) throw fail('Los especiales requieren cantidad de unidades y no llevan precio por docena.');
    if(row.lista_id==='GENERAL') {
      row.unidades_maple=row.categoria==='Especial'?20:30;row.presentacion_maple=`Maple de ${row.unidades_maple} unidades`;
      if(input.price_source!==undefined) {
        try { Object.assign(row,eggPrices.calculate(input.price_source,row[input.price_source],row.categoria)); }
        catch(err) { throw fail(err.message); }
      }
    }
  }
  return row;
}
// Serializes application writes; revisions also detect edits made in Sheets since loading.
let queue=Promise.resolve();
function write(kind, method, input, client) {
  const task=queue.then(()=>writeNow(kind,method,input,client));queue=task.catch(()=>{});return task;
}
async function writeNow(kind,method,input,client=getClient()) {
  if(!Object.hasOwn(schemas,kind))throw fail('Tabla inválida.');
  const schema=schemas[kind];
  const all=await read(client);
  const current=method==='POST'?null:all[kind].find(r=>r._row===input._row);
  if(method!=='POST'&&(!current||current._revision!==input._revision)) throw fail('Los datos cambiaron. Actualizá la página antes de guardar.',409);
  const range=current?`'${schema.tab}'!A${current._row}:${String.fromCharCode(64+schema.fields.length)}${current._row}`:null;
  if(method==='DELETE') {
    if(kind==='regiones'&&['locales','huevos','carnes','regionProductos'].some(k=>all[k].some(r=>r.region_id===current.region_id)))throw fail('Esta región tiene sucursales, productos o configuración. Desactivala para conservar sus datos.',409);
    await client.spreadsheets.values.clear({spreadsheetId:SPREADSHEET_ID,range});return;
  }
  if(kind==='locales'&&input.sucursal_id){
    const branches=await require('./product-branches').read();
    const matches=branches.filter(b=>b.id===input.sucursal_id);
    if(matches.length!==1)throw fail('La sucursal ya no existe o está duplicada. Actualizá el catálogo.',409);
    input={...input,local_id:matches[0].id,nombre_local:matches[0].ubicacion};
  } else if(kind==='locales'&&method==='POST')throw fail('Seleccioná una sucursal del catálogo.');
  const row=validate(kind,input,all);
  if(kind==='carnes'){
    const catalog=require('../chicken-catalog'),key=catalog.key(row);
    if(key&&all.carnes.some(r=>r._row!==current?._row&&r.region_id===row.region_id&&catalog.key(r)===key))throw fail('Esta presentación de pollo ya tiene un precio en la región. Editá el existente.',409);
  }
  if(kind==='huevos'&&row.lista_id==='GENERAL'&&input.price_source===undefined) {
    const changed=eggPrices.fields.some(field=>row[field]!== (current?.[field]??''));
    if(changed&&eggPrices.fields.some(field=>row[field]!==''))throw fail('Indicá cuál de los tres precios editaste para calcular los demás.');
  }
  if(current&&schema.key.some(k=>row[k]!==current[k])&&!(kind==='locales'&&input.sucursal_id))throw fail('Los códigos y la identidad del registro no se pueden cambiar al editar.');
  if(all[kind].some(r=>r._row!==current?._row&&rowKey(schema,r)===rowKey(schema,row)))throw fail('Este registro ya existe en la región y lista seleccionadas.',409);
  const values=[schema.fields.map(f=>row[f])];
  if(kind==='regionProductos')await ensureRegionProductsSheet(client);
  if(current) await client.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range,valueInputOption:'RAW',requestBody:{values}});
  else {
    // Append below existing content, including any template instructions. Never overwrite it.
    await client.spreadsheets.values.append({spreadsheetId:SPREADSHEET_ID,range:`'${schema.tab}'!A:${String.fromCharCode(64+schema.fields.length)}`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values}});
  }
}
module.exports={read,write,saveRegion,connection,schemas,parse,validate,activeValue};
