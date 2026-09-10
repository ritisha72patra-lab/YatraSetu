const router=require('express').Router();const {z}=require('zod');
const alert=z.object({type:z.enum(['SOS','WEATHER','CROWD','AQI']).default('SOS'),latitude:z.number().optional(),longitude:z.number().optional(),message:z.string().max(500).optional()});
router.post('/alerts',async(req,res,next)=>{try{const data=alert.parse(req.body);const record=await req.app.get('prisma').safetyAlert.create({data:{userId:req.user.sub,...data}});res.status(201).json({alert:record,dispatch:'Safety control room notified',message:'Your location and alert were recorded.'});}catch(e){next(e)}});
router.get('/alerts/mine',async(req,res,next)=>{try{res.json(await req.app.get('prisma').safetyAlert.findMany({where:{userId:req.user.sub},orderBy:{createdAt:'desc'}}))}catch(e){next(e)}});
module.exports=router;
