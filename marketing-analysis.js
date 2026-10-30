(function(root){
 const metrics=['publicaciones','visualizaciones','interacciones','comentarios','mensajes'];
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u200b-\u200d\ufeff]/g,' ').trim().replace(/\s+/g,' ').toLowerCase();
 const searchNorm=value=>norm(value).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 function date(v){if(v instanceof Date)return Number.isNaN(v.getTime())?null:new Date(v.getFullYear(),v.getMonth(),v.getDate());const s=String(v||'').trim();let y,m,d,match;if((match=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))){[,d,m,y]=match;}else if((match=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/))){[,y,m,d]=match;}else return null;const result=new Date(+y,+m-1,+d);return result.getFullYear()===+y&&result.getMonth()===+m-1&&result.getDate()===+d?result:null;}
 function start(period,now=new Date()){if(!['7','15','30'].includes(String(period)))return null;const result=date(now);result.setDate(result.getDate()-Number(period)+1);return result;}
 function within(value,limit,now=new Date()){const d=date(value);return !!d&&d>=limit&&d<=date(now);}
 function select(rows,{period='all',grupo='',zona='',fecha='',search='',now=new Date(),limit=start(period,now)}={}){
  const g=norm(grupo),z=norm(zona),tokens=searchNorm(search).split(/\s+/).filter(Boolean),exact=fecha?date(fecha):null;
  return rows.filter(r=>(!g||norm(r.grupo)===g)&&(!z||norm(r.zona)===z)&&(!fecha||(exact&&date(r.fecha)?.getTime()===exact.getTime()))&&tokens.every(token=>searchNorm([r.grupo,r.zona,r.estatus].join(' ')).includes(token))&&(!limit||within(r.fecha,limit,now)));
 }
 function number(value){if(value==null||value==='')return 0;let n=value;if(typeof n==='string'&&/^\d{1,3}(?:[.,]\d{3})+$/.test(n.trim()))n=n.replace(/[.,]/g,'');n=Number(n);if(!Number.isFinite(n)||n<0)throw Error('Hay métricas inválidas. Revisá la hoja antes de generar el informe.');return n;}
 function totals(rows){return Object.fromEntries(metrics.map(k=>[k,rows.reduce((sum,r)=>sum+number(r[k]),0)]));}
 function monthly(rows){
  const buckets=new Map();let invalidDates=0;
  for(const row of rows){
   const day=date(row.fecha);if(!day){invalidDates++;continue;}
   const key=day.getFullYear()+'-'+String(day.getMonth()+1).padStart(2,'0');
   if(!buckets.has(key))buckets.set(key,Object.fromEntries(metrics.map(field=>[field,0])));
   for(const field of metrics)buckets.get(key)[field]+=number(row[field]);
  }
  const ordered=[...buckets.keys()].sort(),keys=[];
  if(ordered.length){
   const [year,month]=ordered[0].split('-').map(Number),cursor=new Date(year,month-1,1);
   let key=ordered[0];
   while(key<=ordered[ordered.length-1]){keys.push(key);cursor.setMonth(cursor.getMonth()+1);key=cursor.getFullYear()+'-'+String(cursor.getMonth()+1).padStart(2,'0');}
  }
  const formatter=new Intl.DateTimeFormat('es-AR',{month:'short',year:'numeric'});
  const labels=keys.map(key=>{const [year,month]=key.split('-').map(Number);const label=formatter.format(new Date(year,month-1,1)).replace(' de ',' ');return label[0].toUpperCase()+label.slice(1);});
  return {keys,labels,invalidDates,series:Object.fromEntries(metrics.map(field=>[field,keys.map(key=>buckets.get(key)?.[field]||0)]))};
 }
 function comparison(rows,filters){
  if(!['7','15','30'].includes(String(filters.period))||filters.fecha)return null;
  const from=start(filters.period,filters.now),end=new Date(from);end.setDate(end.getDate()-1);
  const previousFrom=start(filters.period,end);
  return {days:Number(filters.period),current:totals(select(rows,filters)),previous:totals(select(rows,{...filters,period:'all',now:end,limit:previousFrom}))};
 }
 function active(row,zones){return norm(row.grupo)!=='perfil estandar'&&['publicada','sin definir',''].includes(norm(row.estatus))&&!zones.some(z=>norm(z.nombre)===norm(row.zona)&&z.activo===false);}
 function report(rows,zones,filters){const scoped=select(rows,{...filters,period:'all',limit:null});if(scoped.some(r=>active(r,zones)&&!date(r.fecha)))throw Error('Hay publicaciones activas con fechas inválidas. Revisalas en la hoja antes de generar el informe.');const selected=select(rows,filters).filter(r=>active(r,zones));const byZone=new Map();for(const row of selected){const name=String(row.zona||'Sin sucursal').trim(),key=norm(name);if(!byZone.has(key))byZone.set(key,{nombre:name,rows:[]});byZone.get(key).rows.push(row);}return {rows:selected,totals:totals(selected),groups:new Set(selected.map(r=>norm(r.grupo)).filter(Boolean)).size,zones:[...byZone.values()].map(z=>({...z,totals:totals(z.rows),groups:new Set(z.rows.map(r=>norm(r.grupo)).filter(Boolean)).size})).sort((a,b)=>b.totals.publicaciones-a.totals.publicaciones)};}
 const api={metrics,norm,date,start,within,select,number,totals,monthly,comparison,report};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MarketingAnalysis=api;
})(typeof globalThis!=='undefined'?globalThis:this);
