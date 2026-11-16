const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const appSource=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const bulkSource=appSource.slice(appSource.indexOf('function filterGruposBulk('),appSource.indexOf('function filterGruposBulkSearch('));
assert.ok(bulkSource.includes('function filterGruposBulk'),'No se encontró filterGruposBulk.');

function node(tag){
  const el={
    tagName:tag,children:[],dataset:{},className:'',title:'',type:'',value:'',checked:false,style:{},textContent:'',
    appendChild(child){this.children.push(child);return child;},
    addEventListener(){}
  };
  Object.defineProperty(el,'innerHTML',{get(){return '';},set(){this.children=[];}});
  return el;
}
function findCheckboxes(root,out=[]){
  for(const child of root.children){
    if(child.tagName==='input'&&child.type==='checkbox')out.push(child);
    else findCheckboxes(child,out);
  }
  return out;
}

const groups=[{nombre:'Alfa',zona:'Centro',rowIndex:1},{nombre:'Beta',zona:'Centro',rowIndex:2}];

function context(){
  const zona=node('select');zona.value='';
  const container=node('div');
  container.querySelectorAll=sel=>{
    const boxes=findCheckboxes(container);
    return sel.includes(':checked')?boxes.filter(cb=>cb.checked):boxes;
  };
  const sandbox={
    gruposData:[],marketingData:[],
    document:{
      getElementById:id=>id==='bulk-zona'?zona:id==='bulk-grupos-container'?container:null,
      createElement:tag=>node(tag),
      createTextNode:text=>({tagName:'#text',children:[],textContent:text})
    },
    dashboardGroupOptions:()=>groups,
    zonaActiva:()=>true,
    normFilterVal:v=>String(v||'').toLowerCase(),
    groupOptionLabels:()=>entry=>entry.nombre,
    groupOptionKey:entry=>entry.nombre,
    updateBulkButtonText:()=>{},
    filterGruposBulkSearch:()=>{}
  };
  vm.createContext(sandbox);
  vm.runInContext(bulkSource,sandbox);
  return {container,run:reset=>vm.runInContext('filterGruposBulk('+(reset?'true':'')+')',sandbox)};
}

function seedChecked(container,name){
  const label=node('label');
  const cb=node('input');cb.type='checkbox';cb.value=name;cb.checked=true;
  label.appendChild(cb);
  container.appendChild(label);
}

test('reopening the bulk modal (reset) clears the previous journey selections',()=>{
  const {container,run}=context();
  seedChecked(container,'Alfa');
  run(true);
  const boxes=findCheckboxes(container);
  assert.equal(boxes.length,2);
  assert.equal(boxes.some(cb=>cb.checked),false);
});

test('changing branch without reset keeps the already checked groups',()=>{
  const {container,run}=context();
  seedChecked(container,'Alfa');
  run(false);
  const boxes=findCheckboxes(container);
  assert.equal(boxes.find(cb=>cb.value==='Alfa').checked,true);
  assert.equal(boxes.find(cb=>cb.value==='Beta').checked,false);
});
