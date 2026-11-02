const {test}=require('node:test');
const assert=require('node:assert/strict');
const companies=require('../company-templates');
test('resolves the four companies with accents, dots and legal suffixes',()=>{
 const cases=[
  ['Potage SRL','potage'],['POTAGE S.R.L.','potage'],['Potage','potage'],
  ['Pluma Blanca SRL','pluma-blanca'],['pluma blanca s.r.l.','pluma-blanca'],
  ['El Triangulo SA','el-triangulo'],['El Triángulo S.A.','el-triangulo'],
  ['La Sorpresa SRL','la-sorpresa'],['la sorpresa s.r.l.','la-sorpresa']
 ];
 for(const [value,slug] of cases)assert.equal(companies.forCompany(value).slug,slug,value);
 assert.equal(companies.forCompany('Otra Empresa').slug,'otra-empresa');
 assert.equal(companies.forCompany('Otra Empresa').brand,'Otra Empresa');
});
test('templates read assets from the documented folder and keep Potage fallbacks',()=>{
 const pluma=companies.forCompany('Pluma Blanca SRL');
 for(const [key,name] of [['background','fondo'],['logo','logo'],['eggs','huevos'],['chicken','pollos']]){
  assert.ok(pluma.assets[key].includes('img/plantillas/pluma-blanca/'+name+'.png'));
  assert.ok(pluma.assets[key].includes('img/plantillas/pluma-blanca/'+name+'.jpg'));
 }
 const potage=companies.forCompany('Potage SRL');
 assert.ok(potage.assets.logo.includes('img/icon-512.png'));
 assert.ok(potage.assets.eggs.includes('img/precios/costa.jpg'));
 assert.ok(potage.assets.chicken.includes('img/precios/pollos.png'));
 assert.ok(!pluma.assets.logo.includes('img/icon-512.png'));
});
test('companies are discovered without mixing repeated names',()=>{
 const list=companies.companiesForBranches([{empresa:'Potage SRL'},{empresa:'Potage S.R.L.'},{empresa:'La Sorpresa SRL'},{empresa:''}]);
 assert.deepEqual(list.map(c=>c.slug),['la-sorpresa','potage']);
 assert.equal(list[1].empresa,'Potage SRL');
});
