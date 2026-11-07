require('dotenv').config({quiet:true});
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
(async()=>{
  const url = new URL(process.env.DATABASE_URL);
  const user = await db.user.findUnique({where:{email:'manager@suzali.com'},select:{role:true,isActive:true,password:true}});
  console.log(JSON.stringify({databaseHost:url.hostname,databaseName:url.pathname.slice(1),databaseIsLocal:['localhost','127.0.0.1','::1'].includes(url.hostname),nextAuthOrigin:process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : null,demoAccountExists:!!user,demoAccountActive:user?.isActive??null,demoAccountRole:user?.role??null,demoPasswordMatches:user?await bcrypt.compare('test123',user.password):false}));
})().catch(error=>{console.error(JSON.stringify({code:error.code??null,message:error.message.split('\n').slice(-1)[0]}));process.exitCode=1;}).finally(()=>db.$disconnect());
