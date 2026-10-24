const { google } = require('googleapis');
const crypto = require('crypto');
const eggPrices = require('../egg-prices');
const SPREADSHEET_ID = process.env.PRODUCTS_SHEET_ID || '1hFGIgLe4YgF2Iz5V7wJQcE0tS3tXlKvDtEwKduSEUtg';
const schemas = {
  regiones: { tab: 'Regiones', fields: ['region_id','nombre_region','activa'], key: ['region_id'] },
  locales: { tab: 'Locales', fields: ['local_id','nombre_local','region_id'], key: ['local_id'] },
  huevos: { tab: 'Precios huevos', fields: ['region_id','lista_id','tipo_huevo','categoria','presentacion_maple','unidades_maple','precio_docena','precio_maple','precio_medio_cajon','precio_cajon','cambio_por_docena'], key: ['region_id','lista_id','tipo_huevo'] },
  carnes: { tab: 'Precios pollos y carnes', fields: ['region_id','producto_id','categoria','producto','presentacion','precio'], key: ['region_id','producto_id'] }
};
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
function parse(kind, values=[]) {
  const schema=schemas[kind];
  if (!schema.fields.every((f,i)=>values[0]?.[i]===f)) throw fail(`Revisá los encabezados de la pestaña ${schema.tab}.`,409);
  const seen=new Set();
  return values.slice(1).flatMap((cells,index)=>{
    // The template contains instructions below the Regions table.
    if (!cells[0] || (kind==='regiones' && !/^[A-Za-z0-9_-]{1,80}$/.test(String(cells[0])))) return [];
    const row=Object.fromEntries(schema.fields.map((f,i)=>[f,cells[i]??'']));
    const key=rowKey(schema,row);
    if(seen.has(key)) throw fail(`Hay registros duplicados en ${schema.tab}. Corregilos en la hoja antes de continuar.`,409);
    seen.add(key);
    return [{...row,_row:index+2,_revision:revision(schema.fields.map(f=>row[f]))}];
  });
}
async function read(client=getClient()) {
  const result=await client.spreadsheets.values.batchGet({spreadsheetId:SPREADSHEET_ID,ranges:Object.values(schemas).map(s=>`'${s.tab}'!A1:${String.fromCharCode(64+s.fields.length)}10000`),valueRenderOption:'UNFORMATTED_VALUE'});
  return Object.fromEntries(Object.keys(schemas).map((k,i)=>[k,parse(k,result.data.valueRanges?.[i]?.values)]));
}
function validate(kind, input, all) {
  const schema=schemas[kind]; const row={};
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
  if(kind==='locales'&&!row.nombre_local) throw fail('Indicá el nombre del local.');
  if(kind==='carnes'&&(!row.producto||!row.categoria)) throw fail('Indicá producto y categoría.');
  if(kind==='huevos') {
    if(!['Estándar','Especial'].includes(row.categoria)||!row.presentacion_maple) throw fail('Indicá la categoría y presentación del maple.');
    if(row.categoria==='Especial'&&(row.unidades_maple===''||row.precio_docena!=='')) throw fail('Los especiales requieren cantidad de unidades y no llevan precio por docena.');
    if(row.categoria==='Estándar' && row.lista_id==='GENERAL') {
      row.unidades_maple=30;row.presentacion_maple='Maple de 30 unidades';
      if(input.price_source!==undefined) {
        try { Object.assign(row,eggPrices.calculate(input.price_source,row[input.price_source])); }
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
    if(kind==='regiones'&&['locales','huevos','carnes'].some(k=>all[k].some(r=>r.region_id===current.region_id)))throw fail('Esta región tiene locales o productos. Desactivala o eliminá primero sus registros.',409);
    await client.spreadsheets.values.clear({spreadsheetId:SPREADSHEET_ID,range});return;
  }
  const row=validate(kind,input,all);
  if(kind==='huevos'&&row.categoria==='Estándar'&&row.lista_id==='GENERAL'&&input.price_source===undefined) {
    const changed=eggPrices.fields.some(field=>row[field]!== (current?.[field]??''));
    if(changed&&eggPrices.fields.some(field=>row[field]!==''))throw fail('Indicá cuál de los tres precios editaste para calcular los demás.');
  }
  if(current&&schema.key.some(k=>row[k]!==current[k]))throw fail('Los códigos y la identidad del registro no se pueden cambiar al editar.');
  if(all[kind].some(r=>r._row!==current?._row&&rowKey(schema,r)===rowKey(schema,row)))throw fail('Este registro ya existe en la región y lista seleccionadas.',409);
  const values=[schema.fields.map(f=>row[f])];
  if(current) await client.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range,valueInputOption:'RAW',requestBody:{values}});
  else {
    // Append below existing content, including any template instructions. Never overwrite it.
    await client.spreadsheets.values.append({spreadsheetId:SPREADSHEET_ID,range:`'${schema.tab}'!A:${String.fromCharCode(64+schema.fields.length)}`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values}});
  }
}
module.exports={read,write,connection,schemas,parse,validate};
