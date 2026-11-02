(function(root){
 const DEFAULT_EGGS='img/precios/costa.jpg';
 const DEFAULT_CHICKEN='img/precios/pollos.png';
 const DEFAULT_LOGO='img/icon-512.png';
 const EXTENSIONS=['png','jpg','jpeg','webp'];
 const DEFAULT_COLORS={
  pageEggs:'#ffe36d',pageChicken:'#ffdda5',
  eggPanel:'#ffeda6',eggText:'#161616',
  tableHead:'#ffdaa0',tableRow:'#fff5d8',
  title:'#f05226',titleAccent:'#ff791e',
  tagline:'#ffffff',taglineText:'#f1582c',
  brand:'#ef5126',
  footerTitle:'#af3b1b',branchName:'#af3b1b',branchText:'#493326',
  divider:'#dfb560',note:'#6a4834',eggFootnote:'#78421e',
  chickenLabel:'#943b1d',chickenHead:'#f3bf85',chickenRow:'#fff0d5'
 };
 // Zonas del diseño con fondo propio (coordenadas del lienzo 1080 × 1350).
 // Se pueden ajustar por empresa cuando llegue cada plantilla.
 const DEFAULT_ZONES={
  eggs:{x:40,y:260,w:1000,h:660},
  chicken:{x:40,y:248,w:1000,h:632},
  branches:{x:40,y:940,w:1000,h:390},
  brand:{x:748,y:1244,w:292,h:94}
 };
 const COMPANIES=[
  {slug:'potage',name:'Potage SRL',brand:'Potage',subtitle:'— S.R.L. —',aliases:['potage','potage srl','potage s.r.l.'],logoFallback:true},
  {slug:'pluma-blanca',name:'Pluma Blanca SRL',brand:'Pluma Blanca',subtitle:'— S.R.L. —',aliases:['pluma blanca','pluma blanca srl','pluma blanca s.r.l.']},
  {slug:'el-triangulo',name:'El Triangulo SA',brand:'El Triángulo',subtitle:'— S.A. —',aliases:['el triangulo','el triangulo sa','el triángulo','el triángulo s.a.']},
  {slug:'la-sorpresa',name:'La Sorpresa SRL',brand:'La Sorpresa',subtitle:'— S.R.L. —',aliases:['la sorpresa','la sorpresa srl','la sorpresa s.r.l.']}
 ];
 function normalize(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');
 }
 function slugify(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
 }
 function find(value){
  const key=normalize(value);
  if(!key)return null;
  return COMPANIES.find(c=>normalize(c.name)===key||c.slug===key||(c.aliases||[]).some(a=>normalize(a)===key))||null;
 }
 function paths(slug,name){return EXTENSIONS.map(ext=>'img/plantillas/'+slug+'/'+name+'.'+ext);}
 function materialize(company){
  const logo=paths(company.slug,'logo');
  return {
   slug:company.slug,
   name:company.name,
   brand:company.brand||company.name,
   subtitle:company.subtitle||'',
   layout:'auto',
   // El fondo de la plantilla ya incluye marca y título; no se duplican.
   showBrand:false,
   showTitle:false,
   colors:{...DEFAULT_COLORS,...(company.colors||{})},
   zones:{...DEFAULT_ZONES,...(company.zones||{})},
   panel:'rgba(255,255,255,.9)',
   assets:{
    background:paths(company.slug,'fondo'),
    logo:company.logoFallback?[...logo,DEFAULT_LOGO]:logo,
    eggs:[...paths(company.slug,'huevos'),DEFAULT_EGGS],
    chicken:[...paths(company.slug,'pollos'),DEFAULT_CHICKEN]
   }
  };
 }
 function forCompany(value){
  const match=find(value);
  if(match)return materialize(match);
  const raw=String(value||'').trim();
  return materialize({
   slug:slugify(raw)||'generica',
   name:raw||'Sin empresa',
   brand:raw||'Precios',
   subtitle:'',
   aliases:[]
  });
 }
 function companiesForBranches(branches){
  const found=new Map();
  for(const branch of branches||[]){
   const raw=String(branch.empresa||'').trim();
   if(!raw)continue;
   const company=forCompany(raw);
   if(!found.has(company.slug))found.set(company.slug,{empresa:raw,slug:company.slug,name:company.name});
  }
  return [...found.values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));
 }
 function list(){
  return COMPANIES.map(c=>({slug:c.slug,name:c.name,brand:c.brand,subtitle:c.subtitle}));
 }
 const api={normalize,slugify,find,forCompany,companiesForBranches,list,DEFAULT_ZONES,DEFAULT_COLORS};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CompanyTemplates=api;
 })(typeof globalThis!=='undefined'?globalThis:this);
