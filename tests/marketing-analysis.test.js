const {test}=require('node:test');const assert=require('node:assert/strict');const M=require('../marketing-analysis');const now=new Date(2026,9,28,12);
const row=(fecha,grupo,zona,pubs,views)=>({fecha,grupo,zona,estatus:'PUBLICADA',publicaciones:pubs,visualizaciones:views,interacciones:1,comentarios:0,mensajes:0});
const rows=[row('29/08/2026','Grupo A','Merlo',100,1000),row('28/10/2026','Grupo A',' Merlo ',2,20),row('2026-10-28','grupo a','merlo',3,30),row('29/09/2026','Grupo B','Costa',4,40),row('28/09/2026','Grupo C','Costa',8,80),row('29/10/2026','Grupo D','Costa',16,160)];
test('explicit 30 days include exactly today and previous 29 calendar dates, never future or old updated posts',()=>{const selected=M.select(rows,{period:'30',now});assert.equal(M.totals(selected).publicaciones,9);assert.equal(selected.length,3);assert.equal(M.start('30',now).getTime(),new Date(2026,8,29).getTime());});
test('all is truly unbounded; zone, group, search, date and period intersect',()=>{assert.equal(M.select(rows,{period:'all',now}).length,6);assert.equal(M.totals(M.select(rows,{period:'30',zona:'MERLO',grupo:'grupo a',search:'mérlo',now})).publicaciones,5);assert.equal(M.select(rows,{period:'30',fecha:'2026-09-28',now}).length,0);assert.equal(M.select(rows,{period:'30',fecha:'2026-10-28',now}).length,2);});
test('reports reconcile all five metrics across zones without losing distinct rows, Marketplace or mixed-case zones',()=>{const data=[...rows,row('28/10/2026','Marketplace','Todos',1,10),row('28/10/2026','Perfil Estandar','Merlo',900,900),row('28/10/2026','Grupo Inactivo','Tandil',900,900)];const report=M.report(data,[{nombre:'Tandil',activo:false}],{period:'30',now});assert.equal(report.totals.publicaciones,10);assert.equal(report.totals.visualizaciones,100);assert.equal(report.zones.filter(z=>M.norm(z.nombre)==='merlo').length,1);for(const metric of M.metrics)assert.equal(report.zones.reduce((s,z)=>s+z.totals[metric],0),report.totals[metric]);});
test('date parsing rejects invalid dates and numeric sums never concatenate strings or accept corrupt metrics',()=>{assert.equal(M.date('31/02/2026'),null);assert.equal(M.date('2026-02-29'),null);assert.ok(M.date('29/02/2024'));assert.equal(M.totals([{publicaciones:'1.234'},{publicaciones:2}]).publicaciones,1236);assert.throws(()=>M.totals([{visualizaciones:'bad'}]),/inválidas/);});

test('report generation stops when scoped active publications have invalid dates',()=>{assert.throws(()=>M.report([row('31/02/2026','A','Merlo',1,1)],[],{period:'30',now}),/fechas inválidas/);});

test('search matches group names across punctuation, accents, spaces and word order while respecting other filters',()=>{
 const data=[row('28/10/2026','🛒 TE LO VENDO!! Chascomús','Costa',2,20),row('28/10/2026','Otro grupo','Merlo',3,30)];
 assert.equal(M.select(data,{search:'chascomus vendo te',now}).length,1);
 assert.equal(M.select(data,{search:'TE LO VENDO CHASCOMUS',now}).length,1);
 assert.equal(M.select(data,{search:'chascomus',zona:'Merlo',now}).length,0);
 assert.equal(M.select(data,{search:'   VÉNDO    costa   ',period:'30',fecha:'2026-10-28',now}).length,1);
});

test('monthly charts preserve every filtered metric across years, duplicate dates, profile posts and inactive statuses',()=>{
 const data=[row('05/01/2024','A','Merlo',2,20),row('05/01/2025','A','Merlo',3,30),row('28/10/2026','Perfil Estandar','Merlo',4,40),{...row('28/10/2026','B','Tandil',5,50),estatus:'ELIMINADA'}];
 const monthly=M.monthly(M.select(data,{period:'all',now}));
 assert.equal(monthly.keys[0],'2024-01');assert.equal(monthly.keys.at(-1),'2026-10');assert.equal(monthly.keys.length,34);
 assert.notEqual(monthly.labels[0],monthly.labels[12]);
 for(const field of M.metrics)assert.equal(monthly.series[field].reduce((sum,value)=>sum+value,0),M.totals(data)[field]);
 assert.equal(monthly.series.publicaciones[1],0);
 assert.equal(monthly.series.publicaciones.at(-1),9);
});

test('monthly aggregation respects daily and period scopes and exposes invalid dates without losing table totals',()=>{
 const selected=M.select(rows,{period:'30',fecha:'2026-10-28',now});
 assert.deepEqual(M.monthly(selected).series.publicaciones,[5]);
 const data=[...selected,row('31/02/2026','A','Merlo',99,999)];
 assert.equal(M.totals(data).publicaciones,104);
 assert.equal(M.monthly(data).invalidDates,1);
 assert.deepEqual(M.monthly(data).series.publicaciones,[5]);
 assert.deepEqual(M.monthly([]).labels,[]);
});

test('KPI trends compare adjacent calendar windows with the same group, zone and search filters',()=>{
 const data=[row('28/10/2026','A','Merlo',4,40),row('22/10/2026','A','Merlo',2,20),row('21/10/2026','A','Merlo',3,30),row('16/10/2026','A','Merlo',5,50),row('28/10/2026','B','Costa',100,1000)];
 const trend=M.comparison(data,{period:'7',grupo:'A',zona:'Merlo',search:'a',now});
 assert.equal(trend.current.publicaciones,6);assert.equal(trend.previous.publicaciones,8);
 assert.equal(M.comparison(data,{period:'all',now}),null);
 assert.equal(M.comparison(data,{period:'7',fecha:'2026-10-28',now}),null);
});
