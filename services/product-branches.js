const crypto=require('crypto');
const sheets=require('./sheets');
function branchId(branch){
  const identity=[branch.empresa,branch.ubicacion,branch.direccion].map(v=>String(v||'').trim().normalize('NFC'));
  return 'SUC-'+crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0,24);
}
async function read(){
  const client=sheets.sheets();if(!client)throw new Error('Google Sheets no configurado.');
  const response=await client.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID,range:"'Sucursales'!A1:I10000",valueRenderOption:'FORMATTED_VALUE'});
  const rows=response.data.values||[];
  if(!['Empresa','Ubicacion','Direccion'].every((h,i)=>rows[0]?.[i]===h))throw new Error('Encabezados de sucursales inválidos.');
  return rows.slice(1).filter(r=>r[0]&&r[0]!=='__DELETED__').map(r=>{
    const b={empresa:r[0]||'',ubicacion:r[1]||'',direccion:r[2]||'',contacto:r[3]||'',activo:!['FALSE','0','INACTIVO'].includes(String(r[6]).trim().toUpperCase())};
    return {...b,zona:String(r[5]||'').trim(),id:branchId(b)};
  });
}
module.exports={read,branchId};
