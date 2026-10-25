const productFields={
 regiones:[['region_id','Código de región'],['nombre_region','Nombre'],['activa','Activa',['Sí','No']]],
 locales:[['local_id','Código de sucursal'],['nombre_local','Nombre de sucursal'],['region_id','Región']],
 huevos:[['region_id','Región'],['lista_id','Lista'],['tipo_huevo','Tipo de huevo'],['categoria','Categoría',['Estándar','Especial']],['presentacion_maple','Presentación del maple'],['unidades_maple','Unidades por maple','number'],['precio_docena','Docena','number'],['precio_maple','Maple','number'],['precio_medio_cajon','Medio cajón','number'],['precio_cajon','Cajón','number'],['cambio_por_docena','Cambio por docena','number']],
 carnes:[['region_id','Región'],['producto_id','Código del producto'],['categoria','Categoría'],['producto','Producto'],['presentacion','Presentación'],['precio','Precio','number']]
};
const productKeys={regiones:['region_id'],locales:['local_id'],huevos:['region_id','lista_id','tipo_huevo'],carnes:['region_id','producto_id']};
let productsData=null, productsBusy=false, productEdit=null;
let productBranches=[],branchCatalogError='',requestedBranch=new URLSearchParams(location.search).get('sucursal');
const pe=id=>document.getElementById(id);
const canEditProducts=()=>sessionRole()==='admin'||currentPermissions?.edit_productos===true;
function productNode(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function productButton(text,fn,cls='btn btn-sm btn-outline-secondary'){const b=productNode('button',text,cls);b.type='button';b.onclick=fn;return b;}
function productStatus(text,error=false){pe('products-status').textContent=text;pe('products-status').className='products-status'+(error?' is-error':'');}
function productMoney(value){return value===''||value==null?'Sin cargar':typeof value==='number'?value.toLocaleString('es-AR',{style:'currency',currency:'ARS'}):'Revisar en hoja';}
const productText=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
function filterProductRows(rows,region,search,order){
 const query=productText(search).trim();
 return rows.filter(r=>r.region_id===region&&productText(r.tipo_huevo||r.producto).includes(query))
  .sort((a,b)=>(order==='desc'?-1:1)*String(a.tipo_huevo||a.producto).localeCompare(String(b.tipo_huevo||b.producto),'es',{numeric:true,sensitivity:'base'}));
}
async function loadProducts(){
 if(productsBusy)return;productsBusy=true;pe('products-refresh').disabled=true;productStatus('Cargando productos…');
 try{const {status,body}=await apiFetch('/api/productos',{signal:AbortSignal.timeout(20000)});if(status!==200)throw new Error(body.error||'No pudimos cargar los productos.');
 productsData=body;renderProducts();productStatus('Datos actualizados desde Google Sheets.');
 }catch(e){productsData=null;pe('product-tables').replaceChildren();pe('product-locals').replaceChildren();pe('product-controls').hidden=true;pe('product-new').disabled=true;productStatus(e.name==='TimeoutError'?'La hoja tardó en responder. Volvé a intentar.':e.message,true);}
 finally{productsBusy=false;pe('products-refresh').disabled=false;}
}
function renderProducts(){
 const select=pe('product-region'),previous=select.value;
 const regions=productsData.regiones.filter(r=>canEditProducts()||r.activa==='Sí');
 select.replaceChildren(...regions.map(r=>{const o=productNode('option',r.nombre_region+(r.activa==='No'?' · Inactiva':r.activa==='Revisar'?' · Revisar estado':''));o.value=r.region_id;return o;}));
 if(regions.some(r=>r.region_id===previous))select.value=previous;
 const linked=productsData.locales.find(r=>r.local_id===requestedBranch);
 if(linked&&regions.some(r=>r.region_id===linked.region_id))select.value=linked.region_id;
 select.disabled=!regions.length;pe('product-controls').hidden=false;
 pe('product-editor-actions').hidden=!canEditProducts();
 pe('product-region-edit').disabled=!regions.length;
 pe('product-new').disabled=!regions.length;pe('product-local-add').disabled=!regions.length;
 rebuildProductLocals();
 if(linked&&linked.region_id===select.value)pe('product-local').value=linked.local_id;
 renderProductRegion();
}
function rebuildProductLocals(){
 const select=pe('product-local'),previous=select.value;
 select.replaceChildren(new Option('Todas las sucursales',''));
 const locals=productsData.locales.filter(r=>r.region_id===pe('product-region').value).sort((a,b)=>a.nombre_local.localeCompare(b.nombre_local,'es'));
 for(const local of locals){const branch=productBranches.find(b=>b.id===local.local_id);select.append(new Option(branch?`${branch.ubicacion} · ${branch.empresa} · ${branch.direccion}`:local.nombre_local+' (sin vincular)',local.local_id));}
 if(locals.some(r=>r.local_id===previous))select.value=previous;
 select.disabled=!locals.length;
}
function openProductManagement(){
 const root=pe('product-local-management');root.replaceChildren();
 const locals=productsData?.locales.filter(r=>r.region_id===pe('product-region').value)||[];
 for(const local of locals){const row=productNode('div',undefined,'product-management-row');row.append(productNode('span',local.nombre_local),productButton('Editar / eliminar',()=>openProductForm('locales',local)));root.append(row);}
 if(!locals.length)root.append(productNode('p','No hay sucursales cargadas para esta región.','text-muted'));
 pe('product-editor-actions').hidden=!productsData||!canEditProducts();
 pe('product-management').showModal();
}
function renderProductRegion(){
 if(!productsData)return;
 const id=pe('product-region').value,region=productsData.regiones.find(r=>r.region_id===id);
 pe('region-title').textContent=region?.nombre_region||'Sin regiones disponibles';
 const locals=pe('product-locals');locals.replaceChildren();
 const regionLocals=productsData.locales.filter(r=>r.region_id===id);
 const selectedLocal=regionLocals.find(r=>r.local_id===pe('product-local').value);
 const branch=productBranches.find(b=>b.id===selectedLocal?.local_id);
 locals.textContent=selectedLocal?`${branch?[branch.ubicacion,branch.empresa,branch.direccion,branch.contacto].filter(Boolean).join(' · '):selectedLocal.nombre_local} · Precios de la región ${region?.nombre_region||''}`:regionLocals.length?`Sucursales incluidas: ${regionLocals.map(r=>r.nombre_local).join(', ')}`:'No hay sucursales incluidas todavía.';
 const root=pe('product-tables');root.replaceChildren();if(!region)return;
 if(requestedBranch&&!regionLocals.some(r=>r.local_id===requestedBranch)){
  pe('region-title').textContent='Sucursal sin región de precios disponible';locals.textContent='Vinculá esta sucursal a una región activa desde Gestionar, o elegí una región para consultar su catálogo.';pe('product-results').textContent='';root.append(productNode('p','No se muestran precios de otra sucursal.','product-empty'));return;
 }
 const search=pe('product-search').value,order=pe('product-order').value;
 const eggs=filterProductRows(productsData.huevos.filter(r=>String(r.lista_id).trim().toUpperCase()==='GENERAL'),id,search,order);
 for(const list of [...new Set(eggs.map(r=>r.lista_id))])for(const special of [false,true]){
  const rows=eggs.filter(r=>r.lista_id===list&&(r.categoria==='Especial')===special);if(!rows.length)continue;
  const cols=[['tipo_huevo','Tipo'],['presentacion_maple','Presentación']];
  if(!special)cols.push(['precio_docena','Docena']);cols.push(['precio_maple','Maple'],['precio_cajon','Cajón']);
  root.append(productTable(`Huevos${special?' especiales':''}`,rows,cols,'huevos'));
 }
 const meats=filterProductRows(productsData.carnes,id,search,order);
 for(const category of [...new Set(meats.map(r=>r.categoria))])root.append(productTable(category,meats.filter(r=>r.categoria===category),[['producto','Producto'],['presentacion','Presentación'],['precio','Precio']],'carnes'));
 if(!root.children.length)root.append(productNode('p',search?'No hay productos que coincidan con la búsqueda.':'Esta región todavía no tiene productos.','product-empty'));
 pe('product-results').textContent=`${eggs.length+meats.length} productos · Precios compartidos por las sucursales de esta región`;
 const pending=eggs.filter(row=>row._needsPriceSave).length;
 if(pending)pe('product-results').textContent+=` · ${pending} precios anteriores corregidos a 12 maples. Editá y guardá para actualizar la hoja.`;
}
function productTable(title,rows,cols,kind){
 const section=productNode('section',undefined,'product-section');section.append(productNode('h3',title));
 const wrap=productNode('div',undefined,'product-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',title);
 const table=productNode('table',undefined,'table mb-0');const head=document.createElement('thead'),tr=document.createElement('tr');
 for(const [,label]of cols){const th=productNode('th',label);th.scope='col';tr.append(th);}if(canEditProducts()){const th=productNode('th','Acciones');th.scope='col';tr.append(th);}head.append(tr);table.append(head);
 const body=document.createElement('tbody');for(const row of rows){const tr=document.createElement('tr');for(const [field,label]of cols){let text=field.startsWith('precio')||field==='cambio_por_docena'?productMoney(row[field]):row[field]||'—';if(field==='presentacion_maple'&&row.unidades_maple&&!String(text).includes(String(row.unidades_maple)))text+=` (${row.unidades_maple} un.)`;const td=productNode('td',text);td.dataset.label=label;tr.append(td);}
 if(canEditProducts()){const td=document.createElement('td');td.dataset.label='Acciones';td.append(productButton(row._needsPriceSave?'Guardar corrección':'Editar',()=>openProductForm(kind,row)));tr.append(td);}body.append(tr);}table.append(body);wrap.append(table);section.append(wrap);return section;
}
function openProductForm(kind,row=null){
 if(productsBusy||!canEditProducts()||!productsData)return;
 for(const id of ['product-management','product-create'])pe(id).close();
 productEdit={kind,row};pe('product-form').reset();pe('product-form-error').textContent='';pe('product-form-title').textContent=(row?'Editar ':'Añadir ')+({regiones:'región',locales:'sucursal',huevos:'huevos',carnes:'producto'}[kind]);
 pe('product-delete').hidden=!row;pe('product-delete').textContent=kind==='locales'?'Desvincular sucursal':'Eliminar';const fields=pe('product-fields');fields.replaceChildren();
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
  if(['lista_id','local_id','producto_id'].includes(key)||(key==='region_id'&&kind==='regiones'))box.hidden=true;
  box.append(lab,input);fields.append(box);
  if(kind==='huevos'&&['cambio_por_docena','precio_medio_cajon'].includes(key))box.hidden=true;
  if(kind==='locales'&&key==='nombre_local'){box.hidden=true;input.required=false;}
 }
 if(kind==='locales'){
  const box=productNode('div');const label=productNode('label','Sucursal existente','form-label');label.htmlFor='pf-sucursal';const select=document.createElement('select');select.id='pf-sucursal';select.className='form-select custom-input';select.required=true;select.append(new Option('Seleccioná una sucursal',''));
  for(const branch of productBranches)select.append(new Option(`${branch.ubicacion} · ${branch.empresa} · ${branch.direccion}${branch.activo?'':' (inactiva)'}`,branch.id));
  select.value=row?.local_id||requestedBranch||'';
  const syncBranch=()=>{const branch=productBranches.find(b=>b.id===select.value);if(branch){pe('pf-local_id').value=branch.id;pe('pf-nombre_local').value=branch.ubicacion;}};select.onchange=syncBranch;syncBranch();box.append(label,select);fields.prepend(box);
  if(branchCatalogError)fields.append(productNode('p',branchCatalogError,'product-price-help'));
 }
 if(kind==='huevos'){
  const note=productNode('p','','product-price-help');note.id='product-price-help';note.setAttribute('role','status');fields.append(note);
  const calculate=source=>{
    productEdit.priceSource=source;
    try{
      const input=pe('pf-'+source);if(input.validity.badInput)throw new Error('Ingresá un precio válido.');
      const values=EggPrices.calculate(source,input.value===''?'':Number(input.value),pe('pf-categoria').value);
      for(const key of EggPrices.fields)if(key!==source)pe('pf-'+key).value=values[key];
      pe('product-form-error').textContent='';
    }catch(error){pe('product-form-error').textContent=error.message;}
  };
  const sync=(changed=false)=>{
    const special=pe('pf-categoria').value==='Especial';
    productEdit.priceSource=undefined;
    pe('pf-precio_docena').disabled=special;if(special)pe('pf-precio_docena').value='';
    pe('pf-unidades_maple').required=false;pe('pf-unidades_maple').disabled=true;pe('pf-presentacion_maple').readOnly=true;
    if(!special){pe('pf-unidades_maple').value=30;pe('pf-presentacion_maple').value='Maple de 30 unidades';}
    else{pe('pf-unidades_maple').value=20;pe('pf-presentacion_maple').value='Maple de 20 unidades';}
    note.textContent=special?'20 huevos por maple · 12 maples por cajón (240 huevos). Editá maple o cajón para calcular el otro. No se vende por docena. Los resultados se redondean a centavos.':'12 huevos por docena · 30 por maple · 12 maples por cajón (360 huevos). Editá cualquiera de los tres precios: los otros se calculan al instante, con dos decimales. Si borrás el precio editado, se vacían los tres.';
    if(changed){const source=EggPrices.fields.find(key=>!pe('pf-'+key).disabled&&pe('pf-'+key).value!=='');if(source)calculate(source);}
  };
  pe('pf-categoria').onchange=()=>sync(true);sync();
  if(row?._needsPriceSave){calculate('precio_maple');pe('product-form-error').textContent='Corrección de la regla anterior: cajón = maple × 12. Guardá para actualizar Google Sheets.';}
  for(const key of EggPrices.fields)pe('pf-'+key).addEventListener('input',()=>calculate(key));
 }
 if(kind==='carnes'){
  const section=productNode('section',undefined,'product-price-help');
  section.append(productNode('p','Cada presentación tiene su propio precio. Cambiar un importe no modifica los de otros tamaños o pesos.'));
  if(row){
   const related=productsData.carnes.filter(item=>item.region_id===row.region_id&&item.producto_id!==row.producto_id&&productText(item.producto)===productText(row.producto)&&productText(item.categoria)===productText(row.categoria));
   if(related.length)section.append(productNode('h3','Otras presentaciones','h6'));
   for(const item of related){const line=productNode('div',undefined,'product-management-row');line.append(productNode('span',`${item.presentacion||'Sin presentación'} · ${productMoney(item.precio)}`),productButton('Editar',()=>{pe('product-dialog').close();openProductForm('carnes',item);}));section.append(line);}
   section.append(productButton('Añadir presentación',()=>{
    pe('product-dialog').close();openProductForm('carnes');
    for(const key of ['region_id','categoria','producto'])pe('pf-'+key).value=row[key];
    pe('pf-presentacion').focus();
   }));
  }
  fields.append(section);
 }
 pe('product-dialog').showModal();
}
async function saveProduct(remove=false){
 if(productsBusy)return;
 if(!remove&&!pe('product-form').reportValidity())return;
 if(remove&&!confirm('¿Eliminar este registro de la hoja? Esta acción no se puede deshacer desde la página.'))return;
 const {kind,row}=productEdit;const payload={_row:row?._row,_revision:row?._revision};
 if(!remove)for(const [key,,type]of productFields[kind]){const value=pe('pf-'+key).value;payload[key]=type==='number'&&value!==''?Number(value):value;}
 if(!remove&&kind==='locales')payload.sucursal_id=pe('pf-sucursal').value;
 if(!remove&&kind==='huevos'&&productEdit.priceSource!==undefined){
  payload.price_source=productEdit.priceSource;
  try{Object.assign(payload,EggPrices.calculate(payload.price_source,payload[payload.price_source],payload.categoria));}
  catch(error){pe('product-form-error').textContent=error.message;return;}
 }
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
 pe('products-refresh').onclick=loadProducts;pe('product-region').onchange=()=>{requestedBranch=null;rebuildProductLocals();renderProductRegion();};pe('product-local').onchange=()=>{requestedBranch=null;renderProductRegion();};pe('product-order').onchange=renderProductRegion;
 let searchTimer;pe('product-search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(renderProductRegion,150);};
 pe('product-clear').onclick=()=>{requestedBranch=null;pe('product-local').value='';pe('product-search').value='';pe('product-order').value='asc';renderProductRegion();};
 pe('product-manage').onclick=openProductManagement;pe('product-new').onclick=()=>pe('product-create').showModal();
 pe('product-create-eggs').onclick=()=>openProductForm('huevos');pe('product-create-meat').onclick=()=>openProductForm('carnes');
 document.querySelectorAll('[data-close-dialog]').forEach(button=>button.onclick=()=>pe(button.dataset.closeDialog).close());
 pe('product-region-add').onclick=()=>openProductForm('regiones');pe('product-region-edit').onclick=()=>openProductForm('regiones',productsData.regiones.find(r=>r.region_id===pe('product-region').value));pe('product-local-add').onclick=()=>openProductForm('locales');
 pe('product-cancel').onclick=()=>pe('product-dialog').close();pe('product-dialog').addEventListener('cancel',e=>{if(productsBusy)e.preventDefault();});pe('product-form').onsubmit=e=>{e.preventDefault();saveProduct();};pe('product-delete').onclick=()=>saveProduct(true);
 await loadMyPermissions();pe('product-manage').hidden=!canEditProducts();pe('product-new').hidden=!canEditProducts();
 try{const {status,body}=await apiFetch('/api/productos/sucursales',{signal:AbortSignal.timeout(15000)});if(status!==200)throw Error();productBranches=body.data||[];}catch{branchCatalogError='No pudimos cargar Sucursales. Actualizá la página para reintentar. Los precios siguen disponibles.';}
 await loadProducts();
 if(sessionRole()==='admin'){
  pe('product-connection').hidden=false;
  try{const {status,body}=await apiFetch('/api/productos/conexion');if(status!==200)throw Error();pe('product-service-email').textContent=body.email||'Falta configurar GOOGLE_CREDENTIALS en Render.';}catch{pe('product-service-email').textContent='No pudimos consultar la cuenta de servicio.';}
 }
});
