const productFields={
 regiones:[['region_id','Código de región'],['nombre_region','Nombre'],['activa','Activa',['Sí','No']]],
 locales:[['local_id','Código del local'],['nombre_local','Nombre del local'],['region_id','Región']],
 huevos:[['region_id','Región'],['lista_id','Lista'],['tipo_huevo','Tipo de huevo'],['categoria','Categoría',['Estándar','Especial']],['presentacion_maple','Presentación del maple'],['unidades_maple','Unidades por maple','number'],['precio_docena','Docena','number'],['precio_maple','Maple','number'],['precio_medio_cajon','Medio cajón','number'],['precio_cajon','Cajón','number'],['cambio_por_docena','Cambio por docena','number']],
 carnes:[['region_id','Región'],['producto_id','Código del producto'],['categoria','Categoría'],['producto','Producto'],['presentacion','Presentación'],['precio','Precio','number']]
};
const productKeys={regiones:['region_id'],locales:['local_id'],huevos:['region_id','lista_id','tipo_huevo'],carnes:['region_id','producto_id']};
let productsData=null, productsBusy=false, productEdit=null;
const pe=id=>document.getElementById(id);
const canEditProducts=()=>sessionRole()==='admin'||currentPermissions?.edit_productos===true;
function productNode(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function productButton(text,fn,cls='btn btn-sm btn-outline-secondary'){const b=productNode('button',text,cls);b.type='button';b.onclick=fn;return b;}
function productStatus(text,error=false){pe('products-status').textContent=text;pe('products-status').className='products-status'+(error?' is-error':'');}
function productMoney(value){return value===''||value==null?'Sin cargar':typeof value==='number'?value.toLocaleString('es-AR',{style:'currency',currency:'ARS'}):'Revisar en hoja';}
async function loadProducts(){
 if(productsBusy)return;productsBusy=true;pe('products-refresh').disabled=true;productStatus('Cargando productos…');
 try{const {status,body}=await apiFetch('/api/productos',{signal:AbortSignal.timeout(20000)});if(status!==200)throw new Error(body.error||'No pudimos cargar los productos.');
 productsData=body;renderProducts();productStatus('Datos actualizados desde Google Sheets.');
 }catch(e){productsData=null;pe('product-tables').replaceChildren();pe('product-locals').replaceChildren();pe('product-controls').hidden=true;productStatus(e.name==='TimeoutError'?'La hoja tardó en responder. Volvé a intentar.':e.message,true);}
 finally{productsBusy=false;pe('products-refresh').disabled=false;}
}
function renderProducts(){
 const select=pe('product-region'),previous=select.value;
 const regions=productsData.regiones.filter(r=>canEditProducts()||r.activa==='Sí');
 select.replaceChildren(...regions.map(r=>{const o=productNode('option',r.nombre_region+(r.activa==='Sí'?'':' · Inactiva'));o.value=r.region_id;return o;}));
 if(regions.some(r=>r.region_id===previous))select.value=previous;
 select.disabled=!regions.length;pe('product-controls').hidden=false;
 pe('product-editor-actions').hidden=!canEditProducts();
 pe('product-region-edit').disabled=!regions.length;
 pe('product-add').disabled=!regions.length;pe('product-local-add').disabled=!regions.length;
 renderProductRegion();
}
function renderProductRegion(){
 if(!productsData)return;
 const id=pe('product-region').value,region=productsData.regiones.find(r=>r.region_id===id);
 pe('region-title').textContent=region?.nombre_region||'Sin regiones disponibles';
 const locals=pe('product-locals');locals.replaceChildren();
 productsData.locales.filter(r=>r.region_id===id).forEach(r=>{const box=productNode('span',undefined,'product-local');box.append(productNode('span',r.nombre_local));if(canEditProducts())box.append(productButton('Editar',()=>openProductForm('locales',r)));locals.append(box);});
 if(!locals.children.length)locals.append(productNode('span','No hay locales incluidos todavía.','text-muted'));
 const root=pe('product-tables');root.replaceChildren();if(!region)return;
 const search=pe('product-search').value.trim().toLocaleLowerCase('es');
 const matches=r=>[r.tipo_huevo,r.producto,r.categoria,r.presentacion].join(' ').toLocaleLowerCase('es').includes(search);
 const eggs=productsData.huevos.filter(r=>r.region_id===id&&matches(r));
 for(const list of [...new Set(eggs.map(r=>r.lista_id))])for(const special of [false,true]){
  const rows=eggs.filter(r=>r.lista_id===list&&(r.categoria==='Especial')===special);if(!rows.length)continue;
  const cols=[['tipo_huevo','Tipo'],['presentacion_maple','Presentación']];
  if(!special)cols.push(['precio_docena','Docena']);cols.push(['precio_maple','Maple'],['precio_cajon','Cajón']);
  if(list==='AMARILLA'||rows.some(r=>r.precio_medio_cajon!==''))cols.push(['precio_medio_cajon','Medio cajón']);
  if(!special&&(list==='GENERAL'||rows.some(r=>r.cambio_por_docena!=='')))cols.push(['cambio_por_docena','Cambio / docena']);
  root.append(productTable(`Huevos${special?' especiales':''} · ${list}`,rows,cols,'huevos'));
 }
 const meats=productsData.carnes.filter(r=>r.region_id===id&&matches(r));
 for(const category of [...new Set(meats.map(r=>r.categoria))])root.append(productTable(category,meats.filter(r=>r.categoria===category),[['producto','Producto'],['presentacion','Presentación'],['precio','Precio']],'carnes'));
 if(!root.children.length)root.append(productNode('p',search?'No hay productos que coincidan con la búsqueda.':'Esta región todavía no tiene productos.','product-empty'));
}
function productTable(title,rows,cols,kind){
 const section=productNode('section',undefined,'product-section');section.append(productNode('h3',title));
 const wrap=productNode('div',undefined,'product-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',title);
 const table=productNode('table',undefined,'table mb-0');const head=document.createElement('thead'),tr=document.createElement('tr');
 for(const [,label]of cols){const th=productNode('th',label);th.scope='col';tr.append(th);}if(canEditProducts()){const th=productNode('th','Acciones');th.scope='col';tr.append(th);}head.append(tr);table.append(head);
 const body=document.createElement('tbody');for(const row of rows){const tr=document.createElement('tr');for(const [field,label]of cols){let text=field.startsWith('precio')||field==='cambio_por_docena'?productMoney(row[field]):row[field]||'—';if(field==='presentacion_maple'&&row.unidades_maple&&!String(text).includes(String(row.unidades_maple)))text+=` (${row.unidades_maple} un.)`;const td=productNode('td',text);td.dataset.label=label;tr.append(td);}
 if(canEditProducts()){const td=document.createElement('td');td.dataset.label='Acciones';td.append(productButton('Editar',()=>openProductForm(kind,row)));tr.append(td);}body.append(tr);}table.append(body);wrap.append(table);section.append(wrap);return section;
}
function openProductForm(kind,row=null){
 if(productsBusy||!canEditProducts()||!productsData)return;
 productEdit={kind,row};pe('product-form').reset();pe('product-form-error').textContent='';pe('product-form-title').textContent=(row?'Editar ':'Añadir ')+({regiones:'región',locales:'local',huevos:'huevos',carnes:'producto'}[kind]);
 pe('product-delete').hidden=!row;const fields=pe('product-fields');fields.replaceChildren();
 for(const [key,label,type]of productFields[kind]){
  const box=productNode('div'),lab=productNode('label',label,'form-label');lab.htmlFor='pf-'+key;let input;
  const options=key==='region_id'&&kind!=='regiones'?productsData.regiones.map(r=>[r.region_id,r.nombre_region]):Array.isArray(type)?type.map(v=>[v,v]):null;
  if(options){input=document.createElement('select');for(const [v,l]of options){const o=productNode('option',l);o.value=v;input.append(o);}}
  else{input=document.createElement('input');input.type=type==='number'?'number':'text';if(type==='number'){input.min=key==='unidades_maple'?'1':'0';input.max=key==='unidades_maple'?'1000':'10000000000';input.step=key==='unidades_maple'?'1':'0.01';}else input.maxLength=200;}
  input.id='pf-'+key;input.name=key;input.className='form-control custom-input';
  input.value=row?.[key]??(key==='region_id'&&kind!=='regiones'?pe('product-region').value:key==='activa'?'Sí':key==='categoria'&&kind==='huevos'?'Estándar':key==='lista_id'?'GENERAL':'');
  if(!row&&((kind==='regiones'&&key==='region_id')||key==='local_id'||key==='producto_id'))input.value=({region_id:'REG',local_id:'LOC',producto_id:'PC'}[key])+'-'+crypto.randomUUID().slice(0,8).toUpperCase();
  input.required=productKeys[kind].includes(key)||['nombre_region','nombre_local','producto','categoria','presentacion_maple'].includes(key);
  if(row&&productKeys[kind].includes(key))input.disabled=true;
  box.append(lab,input);fields.append(box);
 }
 if(kind==='huevos'){
  const sync=()=>{const special=pe('pf-categoria').value==='Especial';pe('pf-precio_docena').disabled=special;if(special)pe('pf-precio_docena').value='';pe('pf-unidades_maple').required=special;};pe('pf-categoria').onchange=sync;sync();
 }
 pe('product-dialog').showModal();
}
async function saveProduct(remove=false){
 if(productsBusy)return;
 if(!remove&&!pe('product-form').reportValidity())return;
 if(remove&&!confirm('¿Eliminar este registro de la hoja? Esta acción no se puede deshacer desde la página.'))return;
 const {kind,row}=productEdit;const payload={_row:row?._row,_revision:row?._revision};
 if(!remove)for(const [key,,type]of productFields[kind]){const value=pe('pf-'+key).value;payload[key]=type==='number'&&value!==''?Number(value):value;}
 productsBusy=true;pe('product-form-error').textContent='Guardando…';pe('product-form-set').disabled=true;
 try{const {status,body}=await apiFetch('/api/productos/'+kind,{method:remove?'DELETE':row?'PUT':'POST',body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});if(status!==200)throw new Error(body.error||'No se pudo guardar.');
 pe('product-dialog').close();productsBusy=false;await loadProducts();
 }catch(e){pe('product-form-error').textContent=e.name==='TimeoutError'||e instanceof TypeError?'No pudimos confirmar el resultado. Actualizá los datos antes de repetir el cambio.':e.message;}
 finally{productsBusy=false;pe('product-form-set').disabled=false;}
}
document.addEventListener('DOMContentLoaded',async()=>{
 const user=getCurrentSession();if(!user){location.href='login.html';return;}guardPage('view_productos');
 for(const id of ['display-user-name','nav-user-name'])pe(id).textContent=user.name||'Cuenta';for(const id of ['display-avatar','nav-avatar'])pe(id).textContent=(user.name||'?').slice(0,2).toUpperCase();pe('display-user-role').textContent=user.role;
 for(const id of ['gestion-label','gestion-items'])pe(id).hidden=sessionRole()!=='admin';
 pe('products-refresh').onclick=loadProducts;pe('product-region').onchange=renderProductRegion;pe('product-search').oninput=renderProductRegion;
 pe('product-add').onclick=()=>openProductForm(pe('product-kind').value);pe('product-region-add').onclick=()=>openProductForm('regiones');pe('product-region-edit').onclick=()=>openProductForm('regiones',productsData.regiones.find(r=>r.region_id===pe('product-region').value));pe('product-local-add').onclick=()=>openProductForm('locales');
 pe('product-cancel').onclick=()=>pe('product-dialog').close();pe('product-dialog').addEventListener('cancel',e=>{if(productsBusy)e.preventDefault();});pe('product-form').onsubmit=e=>{e.preventDefault();saveProduct();};pe('product-delete').onclick=()=>saveProduct(true);
 await loadMyPermissions();await loadProducts();
 if(sessionRole()==='admin'){
  pe('product-connection').hidden=false;
  try{const {status,body}=await apiFetch('/api/productos/conexion');if(status!==200)throw Error();pe('product-service-email').textContent=body.email||'Falta configurar GOOGLE_CREDENTIALS en Render.';}catch{pe('product-service-email').textContent='No pudimos consultar la cuenta de servicio.';}
 }
});
