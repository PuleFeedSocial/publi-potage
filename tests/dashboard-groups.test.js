const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const context=vm.createContext({MarketingAnalysis:require('../marketing-analysis')});
vm.runInContext(source.slice(source.indexOf('function normFilterVal'),source.indexOf('function goToPage')),context);

test('group filter keeps every catalog row of the selected branch, even duplicate names',()=>{
 const grupos=[
  {rowIndex:2,nombre:'Mismo nombre',zona:'Merlo',enlace:'https://a.test'},
  {rowIndex:3,nombre:'Mismo nombre',zona:'Merlo',enlace:'https://b.test'},
  {rowIndex:4,nombre:'Mismo nombre',zona:'Merlo',enlace:'https://c.test'},
  {rowIndex:5,nombre:'Mismo nombre',zona:'Merlo',enlace:'https://d.test'},
  {rowIndex:6,nombre:'Mismo nombre',zona:'Tandil'}
 ];
 const options=context.dashboardGroupOptions(grupos,[],'Merlo');
 assert.equal(options.length,4);
 assert.deepEqual(Array.from(options, o=>o.rowIndex),[2,3,4,5]);
});

test('group filter includes branch catalog groups plus marketing-only groups once',()=>{
 const grupos=[
  {rowIndex:2,nombre:'Grupo A',zona:'Merlo'},
  {rowIndex:3,nombre:'Grupo A',zona:'Merlo'},
  {rowIndex:4,nombre:'Grupo B',zona:'Tandil'}
 ];
 const marketing=[
  {grupo:'Grupo A',zona:'Merlo'},
  {grupo:'Sólo en métricas',zona:'Merlo'},
  {grupo:'sólo en métricas ',zona:'Merlo'},
  {grupo:'Grupo B',zona:'Tandil'}
 ];
 const options=context.dashboardGroupOptions(grupos,marketing,'Merlo');
 assert.deepEqual(Array.from(options, o=>o.nombre),['Grupo A','Grupo A','Sólo en métricas']);
});

test('inactive groups stay out of the publication filter but remain available when editing',()=>{
 const grupos=[
  {rowIndex:2,nombre:'Grupo activo',zona:'Merlo',activo:true},
  {rowIndex:3,nombre:'Grupo inactivo',zona:'Merlo',activo:false}
 ];
 assert.deepEqual(Array.from(context.dashboardGroupOptions(grupos,[],'Merlo'), o=>o.nombre),['Grupo activo']);
 assert.deepEqual(Array.from(context.dashboardGroupOptions(grupos,[],'Merlo',{includeInactive:true}), o=>o.nombre),['Grupo activo','Grupo inactivo']);
});

test('every duplicate group option has a unique filter key and a distinguishable label',()=>{
 const grupos=[
  {rowIndex:2,nombre:'Mismo nombre',zona:'Merlo',enlace:'https://facebook.com/groups/111'},
  {rowIndex:3,nombre:'Mismo nombre',zona:'Merlo',enlace:'https://facebook.com/groups/222'},
  {rowIndex:4,nombre:'Mismo nombre',zona:'Merlo',enlace:''},
  {rowIndex:5,nombre:'Mismo nombre',zona:'Merlo',enlace:'https://facebook.com/groups/222'}
 ];
 const options=context.dashboardGroupOptions(grupos,[],'Merlo');
 const keys=options.map(context.groupOptionKey);
 assert.equal(new Set(keys).size,4);
 const labelFor=context.groupOptionLabels(options);
 const labels=options.map(labelFor);
 assert.equal(new Set(labels).size,4);
 assert.match(labels[0],/#2.*111/);
 assert.match(labels[1],/#3.*222/);
 assert.match(labels[2],/#4/);
 assert.match(labels[3],/#5.*222/);
});

test('inactive catalog groups do not reappear through their historical publications',()=>{
 const grupos=[{rowIndex:2,nombre:'Grupo inactivo',zona:'Merlo',activo:false}];
 const marketing=[{grupo:'Grupo inactivo',zona:'Merlo'}];
 assert.equal(context.dashboardGroupOptions(grupos,marketing,'Merlo').length,0);
 assert.equal(context.dashboardGroupOptions(grupos,marketing,'Merlo',{includeInactive:true}).length,1);
});
