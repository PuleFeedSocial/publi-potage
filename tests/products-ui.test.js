const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../productos.js'),'utf8');
function context(){const c=vm.createContext({location:{search:''},URLSearchParams,document:{addEventListener(){}}});vm.runInContext(script,c);return c;}
test('product filters match names without accents and isolate the selected region',()=>{
 const c=context();c.rows=[{region_id:'R1',producto:'Carré de cerdo'},{region_id:'R2',producto:'Carré de cerdo'},{region_id:'R1',producto:'Pechuga',categoria:'Carré'}];
 assert.equal(vm.runInContext("filterProductRows(rows,'R1','carre','asc').length",c),1);
 assert.equal(vm.runInContext("filterProductRows(rows,'R2','pechuga','asc').length",c),0);
});
test('product name sorting is numeric, reversible and does not mutate source rows',()=>{
 const c=context();c.rows=[{region_id:'R',tipo_huevo:'B10'},{region_id:'R',tipo_huevo:'B2'},{region_id:'R',tipo_huevo:'B1'}];
 assert.equal(vm.runInContext("filterProductRows(rows,'R','','asc').map(r=>r.tipo_huevo).join(',')",c),'B1,B2,B10');
 assert.equal(vm.runInContext("filterProductRows(rows,'R','','desc').map(r=>r.tipo_huevo).join(',')",c),'B10,B2,B1');
 assert.equal(c.rows[0].tipo_huevo,'B10');
});
