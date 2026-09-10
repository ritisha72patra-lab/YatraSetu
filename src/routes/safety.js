const router=require('express').Router();const {z}=require('zod');
const alert=z.object({type:z.enum(['SOS','WEATHER','CROWD','AQI']).default('SOS'),latitude:z.number().optional(),longitude:z.number().optional(),message:z.string().max(500).optional()});
const HELPLINES = [
  { label: 'National emergency', number: '112' },
  { label: 'Police', number: '100' },
  { label: 'Ambulance', number: '108' },
  { label: 'Tourist helpline (India)', number: '1363' },
];
router.post('/alerts',async(req,res,next)=>{try{if(req.user.role==='ADMIN')return res.status(403).json({error:'Admin accounts cannot send traveller SOS alerts. Sign in as a traveller.'});const data=alert.parse(req.body);const record=await req.app.get('prisma').safetyAlert.create({data:{userId:req.user.sub,...data},include:{user:{select:{name:true,email:true}}}});res.status(201).json({alert:record,dispatch:'Safety control room notified',ticket:`YS-SOS-${record.id.slice(-6).toUpperCase()}`,reaches:'YatraSetu safety control room → Admin console → Active SOS map + alert table (monitored 24/7). An admin resolves it after contacting you.',message:'Your location and alert were recorded.',helplines:HELPLINES,nextSteps:['Keep your phone on — the safety team will call/email you.','If in immediate danger, also call 112 now.','Track this ticket under Live safety → My SOS history.']});}catch(e){next(e)}});
router.get('/alerts/mine',async(req,res,next)=>{try{res.json(await req.app.get('prisma').safetyAlert.findMany({where:{userId:req.user.sub},orderBy:{createdAt:'desc'},take:20}))}catch(e){next(e)}});
router.get('/helplines',async(_,res)=>{res.json({helplines:HELPLINES,note:'SOS alerts reach the YatraSetu admin control room. These public numbers are for direct emergency dialling and do not receive app data.'})});
module.exports=router;
