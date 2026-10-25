const regionTypes={huevos:'Huevos',pollos:'Pollos',cerdos:'Cerdos',carnes:'Carnes'};
let regionsData=null,regionBranches=[],regionDirectoryError='',regionEditing=null,regionsBusy=false;
const re=id=>document.getElementById(id);
const regionCanEdit=()=>sessionRole()==='admin'||currentPermissions?.edit_productos===true;
const regionText=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function rn(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function regionEnabled(id,type){return !regionsData.regionProductos.some(r=>r.region_id===id&&r.tipo===type&&r.activo!=='Sí');}
async function loadRegions(){
 if(regionsBusy)return;regionsBusy=true;re('regions-refresh').disabled=true;re('regions-add').disabled=true;re('regions-status').textContent='Cargando regiones…';
 try{
  const {status,body}=await apiFetch('/api/productos',{signal:AbortSignal.timeout(20000)});if(status!==200)throw Error(body.error||'No se pudieron cargar las regiones.');
  regionsData=body;renderRegions();re('regions-status').textContent=body.regiones.length+' regiones';
 }catch(error){regionsData=null;re('regions-rows').replaceChildren();re('regions-status').textContent=error.message;}
 finally{regionsBusy=false;re('regions-refresh').disabled=false;re('regions-add').disabled=!regionsData;}
}
function renderRegions(){
 const body=re('regions-rows');body.replaceChildren();const query=regionText(re('regions-search').value);
 for(const region of regionsData.regiones.slice().sort((a,b)=>a.nombre_region.localeCompare(b.nombre_region,'es'))){
  const branches=regionsData.locales.filter(r=>r.region_id===region.region_id);
  if(!regionText(region.nombre_region+' '+branches.map(r=>r.nombre_local).join(' ')).includes(query))continue;
  const tr=rn('tr');
  const types=Object.keys(regionTypes).filter(t=>regionEnabled(region.region_id,t)).map(t=>regionTypes[t]);
  for(const [label,value]of [['Región',region.nombre_region],['Estado',region.activa==='Sí'?'Activa':region.activa==='No'?'Inactiva':'Revisar estado'],['Sucursales',branches.map(r=>r.nombre_local).join(', ')||'Sin sucursales'],['Productos habilitados',types.join(', ')||'Ninguno']]){const td=rn('td',value);td.dataset.label=label;td.style.whiteSpace='normal';tr.append(td);}
  const td=rn('td');td.dataset.label='Acciones';
  const link=rn('a','Ver precios','btn btn-sm btn-outline-secondary me-2');link.href='productos.html?region='+encodeURIComponent(region.region_id);td.append(link);
  if(regionCanEdit()){
   const edit=rn('button','Modificar','btn btn-sm btn-outline-primary');edit.onclick=()=>openRegion(region);td.append(edit);
   const remove=rn('button','Eliminar','btn btn-sm btn-outline-danger ms-2');remove.onclick=()=>{openRegion(region);saveRegionForm(true);};td.append(remove);
  }
  tr.append(td);body.append(tr);
 }
 if(!body.children.length){const td=rn('td','No hay regiones que coincidan.');td.colSpan=5;const tr=rn('tr');tr.append(td);body.append(tr);}
}
function regionCheckbox(id,label,checked,isSwitch=false){
 const box=rn('div',undefined,'form-check '+(isSwitch?'form-switch ':'')+'my-3');const input=rn('input');input.type='checkbox';input.id=id;input.className='form-check-input';input.checked=checked;if(isSwitch)input.setAttribute('role','switch');
 const lab=rn('label',label,'form-check-label');lab.htmlFor=id;box.append(input,lab);return {box,input};
}
function openRegion(region=null){
 if(regionsBusy||!regionsData||!regionCanEdit())return;
 regionEditing=region;re('region-form').reset();re('region-error').textContent='';re('region-fields').disabled=false;
 re('region-form-title').textContent=region?'Modificar región':'Añadir región';re('region-name').value=region?.nombre_region||'';re('region-active').checked=region?region.activa==='Sí':true;re('region-delete').hidden=!region;
 const switches=re('region-switches');switches.replaceChildren();
 for(const [type,label]of Object.entries(regionTypes))switches.append(regionCheckbox('region-type-'+type,label,region?regionEnabled(region.region_id,type):true,true).box);
 const selected=regionsData.locales.filter(r=>r.region_id===region?.region_id),list=re('region-branches');list.replaceChildren();
 const choices=[...regionBranches];
 for(const old of selected)if(!choices.some(b=>b.id===old.local_id))choices.push({id:old.local_id,ubicacion:old.nombre_local,legacy:true});
 choices.sort((a,b)=>a.ubicacion.localeCompare(b.ubicacion,'es')).forEach((branch,index)=>{
  const owner=regionsData.locales.find(r=>r.local_id===branch.id&&r.region_id!==region?.region_id);
  const label=[branch.ubicacion,branch.empresa,branch.direccion,branch.contacto].filter(Boolean).join(' · ')+(branch.legacy?' (asociación anterior)':'')+(owner?' — asignada a '+(regionsData.regiones.find(r=>r.region_id===owner.region_id)?.nombre_region||owner.region_id):'');
  const {box,input}=regionCheckbox('region-branch-'+index,label,selected.some(r=>r.local_id===branch.id));input.dataset.branchId=branch.id;input.disabled=!!owner;list.append(box);
 });
 re('region-branches-status').textContent=regionDirectoryError||'Cada sucursal puede pertenecer a una región. Desmarcarla no elimina la sucursal del sistema.';
 re('region-dialog').showModal();
}
async function saveRegionForm(remove=false){
 if(regionsBusy||!regionCanEdit())return;
 if(!remove&&!re('region-form').reportValidity())return;
 if(remove&&(!regionEditing||!confirm('¿Eliminar esta región y desvincular sus sucursales? Las sucursales se conservarán. Si tiene productos, primero deberás retirarlos o desactivar la región.')))return;
 const payload={region_id:regionEditing?.region_id||'REG-'+crypto.randomUUID().slice(0,8).toUpperCase(),_configRevision:regionEditing?._configRevision,nombre_region:re('region-name').value.trim(),activa:re('region-active').checked?'Sí':'No',tipos:Object.fromEntries(Object.keys(regionTypes).map(t=>[t,re('region-type-'+t).checked])),sucursales:Array.from(re('region-branches').querySelectorAll('input:checked')).map(el=>el.dataset.branchId)};
 regionsBusy=true;re('region-fields').disabled=true;re('region-error').textContent='Guardando…';
 try{
  const {status,body}=await apiFetch('/api/productos/region-config',{method:remove?'DELETE':regionEditing?'PUT':'POST',body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  if(status!==200)throw Error(body.error||'No se pudo guardar.');
  re('region-dialog').close();regionsBusy=false;await loadRegions();
 }catch(error){re('region-error').textContent=error.name==='TimeoutError'||error instanceof TypeError?'No pudimos confirmar el guardado. Cerrá y actualizá antes de volver a intentar.':error.message;}
 finally{regionsBusy=false;re('region-fields').disabled=false;}
}
document.addEventListener('DOMContentLoaded',async()=>{
 const user=getCurrentSession();if(!user){location.href='login.html';return;}guardPage('view_productos');
 for(const id of ['display-user-name','nav-user-name'])re(id).textContent=user.name||'Cuenta';
 for(const id of ['display-avatar','nav-avatar'])re(id).textContent=(user.name||'?').slice(0,2).toUpperCase();
 re('display-user-role').textContent=user.role;for(const id of ['gestion-label','gestion-items'])re(id).hidden=sessionRole()!=='admin';
 re('regions-refresh').onclick=async()=>{await loadRegionDirectory();await loadRegions();};re('regions-search').oninput=()=>{if(regionsData)renderRegions();};re('regions-add').onclick=()=>openRegion();
 re('region-form').onsubmit=e=>{e.preventDefault();saveRegionForm();};re('region-delete').onclick=()=>saveRegionForm(true);re('region-cancel').onclick=()=>re('region-dialog').close();re('region-dialog').addEventListener('cancel',e=>{if(regionsBusy)e.preventDefault();});
 await loadMyPermissions();re('regions-add').hidden=!regionCanEdit();await loadRegionDirectory();await loadRegions();
});
async function loadRegionDirectory(){
 try{const {status,body}=await apiFetch('/api/productos/sucursales',{signal:AbortSignal.timeout(15000)});if(status!==200)throw Error();regionBranches=body.data||[];regionDirectoryError='';}
 catch{regionBranches=[];regionDirectoryError='No se pudo cargar el catálogo de sucursales. Se conservan las asociaciones actuales. Pulsá Actualizar para reintentar.';}
}
