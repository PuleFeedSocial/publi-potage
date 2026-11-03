(function(root){
 const DEFAULT_EGGS='img/precios/costa.jpg';
 const DEFAULT_CHICKEN='img/precios/pollos.png';
 const DEFAULT_LOGO='img/precios/logo-potage.png';
 const EXTENSIONS=['png','jpg','jpeg','webp'];
 const DEFAULT_COLORS={
  pageEggs:'#ffdf6e',pageChicken:'#fdd9a3',
  eggPanel:'#feeba6',eggText:'#24180e',
  tableHead:'#fdd69b',tableRow:'#fff3e3',
  title:'#e45122',titleAccent:'#f07a1e',
  tagline:'#ffffff',taglineText:'#cf4b28',
  brand:'#ee5126',
  footerTitle:'#a84219',branchName:'#df5620',branchText:'#6e3b20',
  divider:'#e59c55',note:'#8a4b24',eggFootnote:'#8a4b24',
  chickenLabel:'#943b1d',chickenHead:'#f3bf85',chickenRow:'#fff0d5',
  chickenLine:'#e97843',chickenText:'#392719'
 };
 // Zonas para plantillas con fondo de 2240 × 1880. El diseño estándar usa
 // las coordenadas de la referencia y no depende de estas zonas.
 const DEFAULT_ZONES={
  eggs:{x:76,y:420,w:2088,h:940},
  chicken:{x:76,y:420,w:2088,h:940},
  branches:{x:76,y:1320,w:2088,h:430},
  brand:{x:1460,y:1400,w:650,h:330}
 };
 const COMPANIES=[
  {slug:'potage',name:'Potage SRL',brand:'Potage',subtitle:'— S.R.L. —',aliases:['potage','potage srl','potage s.r.l.'],logoFallback:true},
  {slug:'pluma-blanca',name:'Pluma Blanca SRL',brand:'Pluma Blanca',subtitle:'— S.R.L. —',aliases:['pluma blanca','pluma blanca srl','pluma blanca s.r.l.']},
  {slug:'el-triangulo',name:'El Triangulo SA',brand:'El Triángulo',subtitle:'— S.A. —',aliases:['el triangulo','el triangulo sa','el triángulo','el triángulo s.a.'],layout:'el-triangulo'},
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
   layout:company.layout||'auto',
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
