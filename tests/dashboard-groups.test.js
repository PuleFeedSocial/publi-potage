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
