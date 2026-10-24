const router=require('express').Router();
const {authenticate,requirePermission,requireAdmin}=require('../middleware/auth');
const products=require('../services/products');
const {logAction}=require('./logs');
router.use(authenticate);
router.get('/conexion',requireAdmin,(req,res)=>{
  try{res.json(products.connection());}catch{res.status(503).json({error:'Revisá GOOGLE_CREDENTIALS en Render.'});}
});
function error(res,err){return res.status(err.publicMessage?err.status:503).json({error:err.publicMessage||'No se pudo acceder a la hoja de productos. Revisá la conexión y que la cuenta de servicio tenga acceso de Editor.'});}
router.get('/',requirePermission('view_productos'),async(req,res)=>{try{res.json(await products.read());}catch(err){error(res,err);}});
for(const method of ['post','put','delete']) router[method]('/:tabla',requirePermission('edit_productos'),async(req,res)=>{
  try{await products.write(req.params.tabla,req.method,req.body);logAction(req.user.id,req.user.email,'Productos',`${req.method} ${req.params.tabla}`,req.ip);res.json({message:'Cambio guardado en Google Sheets.'});}catch(err){error(res,err);}
});
module.exports=router;
