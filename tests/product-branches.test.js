const {test}=require('node:test');
const assert=require('node:assert/strict');
const branches=require('../services/product-branches');
test('directory IDs are stable across row order and phone changes, and distinguish addresses',async(t)=>{
 const rows=[['Empresa','Ubicacion','Direccion','Contacto','Horario','Zona','Activo'],['Potage','Centro','Calle 1','123','','','TRUE'],['__DELETED__'],['Potage','Centro','Calle 2','456','','','FALSE']];
 t.mock.method(require('../services/sheets'),'sheets',()=>({spreadsheets:{values:{get:async()=>({data:{values:rows}})}}}));
 const result=await branches.read();assert.equal(result.length,2);assert.notEqual(result[0].id,result[1].id);assert.equal(result[1].activo,false);
 assert.equal(branches.branchId({...result[0],contacto:'999'}),result[0].id);
 [rows[1],rows[3]]=[rows[3],rows[1]];
 assert.equal((await branches.read())[1].id,result[0].id);
});
