const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function zonaSummaryKey'),source.indexOf('function renderZonasDashboardInner')),context);
const configured=[{nombre:'Merlo',activo:true},{nombre:'Tandil',activo:false},{nombre:'Nueva zona',activo:true}];
const rows=[{zona:' MERLO ',publicaciones:2,visualizaciones:12},{zona:'merlo',publicaciones:3,visualizaciones:8},{zona:'Tandil',publicaciones:4},{zona:'Solo hoja',publicaciones:1}];
const groups=[{nombre:'Grupo A',zona:'merlo'},{nombre:' grupo a ',zona:' MERLO '},{nombre:'Grupo B',zona:'Tandil'},{nombre:'Grupo C',zona:'Solo hoja'}];
test('all configured zones appear, including empty and inactive zones, with Sheet metrics',()=>{
 const {sortedZones,totalGruposUnicos}=context.buildZonaSummary(configured,rows,groups,'');
 assert.equal(sortedZones.length,4);
 const merlo=sortedZones.find(z=>z.zona==='Merlo');assert.equal(merlo.publicaciones,5);assert.equal(merlo.visualizaciones,20);assert.equal(merlo.grupos.size,1);
 const empty=sortedZones.find(z=>z.zona==='Nueva zona');assert.equal(empty.publicaciones,0);assert.equal(empty.grupos.size,0);
 const inactive=sortedZones.find(z=>z.zona==='Tandil');assert.equal(inactive.activo,false);assert.equal(inactive.publicaciones,4);assert.equal(totalGruposUnicos,3);
});
test('zone selection filters metrics and group counts without reintroducing other zones',()=>{
 const result=context.buildZonaSummary(configured,rows,groups,' MERLO ');
 assert.equal(result.sortedZones.length,1);assert.equal(result.sortedZones[0].publicaciones,5);assert.equal(result.totalGruposUnicos,1);
});
test('empty periods keep configured zones visible and unusual names cannot collide with object properties',()=>{
 const result=context.buildZonaSummary([...configured,{nombre:'__proto__'},{nombre:'constructor'}],[],[],'');
 assert.equal(result.sortedZones.length,5);assert.ok(result.sortedZones.every(z=>z.publicaciones===0));
});
test('period Todo has no hidden date cap, and a selected zone respects explicit periods',async()=>{
 let limit;const sandbox=vm.createContext({MarketingAnalysis:require('../marketing-analysis'),document:{getElementById:()=>({value:'Merlo'})},chartsInstances:{},filterPeriodZonas:'all',API_BASE:'',authFetch:async()=>({ok:true,json:async()=>({data:[]})}),renderZonasDashboardInner:(g,z,p)=>{limit=p;}});
 vm.runInContext(source.slice(source.indexOf('function renderZonasDashboard()'),source.indexOf('// The configured catalog')),sandbox);
 sandbox.renderZonasDashboard();await new Promise(r=>setImmediate(r));assert.equal(limit,null);
 sandbox.filterPeriodZonas='7';sandbox.renderZonasDashboard();await new Promise(r=>setImmediate(r));assert.ok(limit);assert.ok(Date.now()-limit.getTime()>=6*86400000);
});
