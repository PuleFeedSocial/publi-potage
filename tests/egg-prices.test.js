const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calculate}=require('../egg-prices');
const {validate}=require('../services/products');
test('standard eggs convert from any of the three price inputs',()=>{
 const expected={precio_docena:12000,precio_maple:30000,precio_cajon:360000};
 for(const [key,value]of Object.entries(expected))assert.deepEqual(calculate(key,value),expected);
});
test('conversion rounds directly from source cents and preserves zero vs blank',()=>{
 assert.deepEqual(calculate('precio_cajon',100),{precio_docena:3.33,precio_maple:8.33,precio_cajon:100});
 assert.deepEqual(calculate('precio_maple',0),{precio_docena:0,precio_maple:0,precio_cajon:0});
 assert.deepEqual(calculate('precio_docena',''),{precio_docena:'',precio_maple:'',precio_cajon:''});
 for(const value of [-1,Infinity,NaN,'12',1.001,1e10])assert.throws(()=>calculate('precio_docena',value));
 assert.throws(()=>calculate('precio',10));
});
test('server recalculates manipulated totals from selected base and excludes specials',()=>{
 const all={regiones:[{region_id:'R'}]};
 const row={region_id:'R',lista_id:'GENERAL',tipo_huevo:'B1',categoria:'Estándar',presentacion_maple:'Maple',unidades_maple:20,precio_docena:12000,precio_maple:1,precio_cajon:2,price_source:'precio_docena'};
 const result=validate('huevos',row,all);
 assert.equal(result.precio_maple,30000);assert.equal(result.precio_cajon,360000);assert.equal(result.unidades_maple,30);
 const special=validate('huevos',{...row,categoria:'Especial',precio_docena:'',unidades_maple:20},all);
 assert.equal(special.precio_maple,1);assert.equal(special.precio_cajon,2);assert.equal(special.unidades_maple,20);
 assert.throws(()=>validate('huevos',{...row,price_source:'precio'},all));
});
