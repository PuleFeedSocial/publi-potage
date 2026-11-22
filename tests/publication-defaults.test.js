const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'pages','dashboard.html'),'utf8');
const app=fs.readFileSync(path.join(root,'scripts','app.js'),'utf8');

function inputValue(id){const m=html.match(new RegExp('id="'+id+'"[^>]*\\bvalue="([^"]*)"'));return m&&m[1];}
function selectDefault(id){const m=html.match(new RegExp('<select[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</select>'));if(!m)return null;const o=m[1].match(/<option[^>]*\bselected\b[^>]*>([^<]*)</);return o?o[1].trim():null;}

test('both publication modals default Publicaciones to 1 in the markup',()=>{
  assert.equal(inputValue('mk-pubs'),'1');
  assert.equal(inputValue('bulk-pubs'),'1');
});

test('both publication modals default Estatus to PUBLICADA in the markup',()=>{
  assert.equal(selectDefault('mk-estatus'),'PUBLICADA');
  assert.equal(selectDefault('bulk-estatus'),'PUBLICADA');
});

test('the add and bulk modal initializers force 1 and PUBLICADA when opened',()=>{
  assert.match(app,/getElementById\('mk-pubs'\)\.value = 1;/);
  assert.match(app,/getElementById\('mk-estatus'\)\.value = 'PUBLICADA';/);
  assert.match(app,/getElementById\('bulk-pubs'\)\.value = 1;/);
  assert.match(app,/getElementById\('bulk-estatus'\)\.value = 'PUBLICADA';/);
});
