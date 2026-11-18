const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const logsSource=fs.readFileSync(path.join(__dirname,'..','assets','js','pages','logs.js'),'utf8');
const instrumented=logsSource+`
;globalThis.__logs={
  set data(v){logsData=v;},
  renderLogs,renderMoreLogs,
  get rendered(){return _logsRendered;},
  get filtered(){return _logsFiltered;}
};
`;

function makeEl(){
  const el={children:[],className:'',style:{},_html:'',hidden:false,innerText:'',value:'',textContent:'',
    appendChild(child){
      if(child&&child.__fragment){for(const c of child.children)this.children.push(c);}
      else this.children.push(child);
      return child;
    }};
  Object.defineProperty(el,'innerHTML',{get(){return el._html;},set(v){el._html=v;el.children=[];}});
  return el;
}
function makeFragment(){return{__fragment:true,children:[],appendChild(c){this.children.push(c);return c;}};}

function context(){
  const elements={};
  const byId=id=>elements[id]||(elements[id]=makeEl());
  const sandbox={
    document:{getElementById:byId,createElement:()=>makeEl(),createDocumentFragment:makeFragment,addEventListener:()=>{}},
    escHtml:s=>s==null?'':String(s),
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(instrumented,sandbox);
  return {sandbox,byId,api:sandbox.__logs};
}

const makeLogs=n=>Array.from({length:n},(_,i)=>({
  id:i+1,
  email:'u'+(i%3)+'@test.com',
  accion:'Edición de grupo',
  detalle:'Fila #'+(i+1),
  created_at:new Date(Date.UTC(2025,0,1,0,0,i)).toISOString()
}));

test('the logs table renders one page at a time and loads the rest on demand',()=>{
  const {byId,api}=context();
  api.data=makeLogs(500);
  api.renderLogs();
  const tbody=byId('logs-tbody');
  assert.equal(tbody.children.length,200);
  const btn=byId('logs-load-more');
  assert.equal(btn.hidden,false);
  assert.match(btn.innerHTML,/300/);
  api.renderMoreLogs();
  assert.equal(tbody.children.length,400);
  api.renderMoreLogs();
  assert.equal(tbody.children.length,500);
  assert.equal(btn.hidden,true);
});

test('only the first rows get an entrance animation',()=>{
  const {byId,api}=context();
  api.data=makeLogs(500);
  api.renderLogs();
  const tbody=byId('logs-tbody');
  assert.ok(tbody.children[0].style.animation);
  assert.ok(tbody.children[19].style.animation);
  assert.equal(tbody.children[20].style.animation,undefined);
  assert.equal(tbody.children[199].style.animation,undefined);
});

test('filters reset the list to the first page',()=>{
  const {byId,api}=context();
  api.data=makeLogs(500);
  api.renderLogs();
  byId('logs-buscar').value='u1@test.com';
  api.renderLogs();
  assert.equal(byId('logs-tbody').children.length,167);
  assert.match(byId('logs-count').innerText,/167/);
});

test('a silent refresh keeps the already expanded rows',()=>{
  const {byId,api}=context();
  api.data=makeLogs(500);
  api.renderLogs();
  api.renderMoreLogs();
  assert.equal(byId('logs-tbody').children.length,400);
  api.renderLogs(true);
  assert.equal(byId('logs-tbody').children.length,400);
});
