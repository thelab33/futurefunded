import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {mkdirSync,existsSync} from "node:fs";
import {createRequire} from "node:module";
import {homedir} from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const port = Number(process.env.FF_CAMPAIGN_REVIEW_PORT ?? 3366);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error("Choose an unused review port between 1024 and 65535.");
const probe=createServer();
await new Promise((resolve,reject)=>{probe.once("error",()=>reject(new Error(`Review port ${port} is already in use. Set FF_CAMPAIGN_REVIEW_PORT to another port.`)));probe.listen(port,"127.0.0.1",resolve);});
await new Promise((resolve,reject)=>probe.close(error=>error?reject(error):resolve()));
const downloads=existsSync("/mnt/c/Users/arodG/Downloads")?"/mnt/c/Users/arodG/Downloads":path.join(homedir(),"Downloads");
const output=path.resolve(process.env.FF_CAMPAIGN_REVIEW_DIR ?? path.join(downloads,"FutureFunded_Campaign_Review_"+new Date().toISOString().replace(/[:.]/g,"-")));
mkdirSync(output,{recursive:true});
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{
 cwd:process.cwd(),env:{...process.env,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","inherit","inherit"],
});
let exited=false, spawnError;
server.on("exit",()=>{exited=true;});server.on("error",error=>{spawnError=error;});
const stop=()=>{if(!exited)server.kill("SIGTERM");};
process.once("SIGINT",()=>{stop();process.exitCode=130;});
process.once("SIGTERM",()=>{stop();process.exitCode=143;});
try {
 const deadline=Date.now()+45000;let ready=false;
 while(Date.now()<deadline){
  if(exited||spawnError)throw new Error("Owned review server exited before becoming ready.");
  try {const response=await fetch(base+"/c/connect-atx-elite",{signal:AbortSignal.timeout(2000)});if(response.status===200){ready=true;break;}}
  catch { /* The owned child may still be starting. */ }
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!ready)throw new Error("Owned campaign preview did not become ready within 45 seconds.");
 const run=spawn(process.execPath,[require.resolve("@playwright/test/cli"),"test","--config","playwright.campaign.config.ts"],{
  cwd:process.cwd(),env:{...process.env,FF_CAMPAIGN_BASE_URL:base,FF_CAMPAIGN_REVIEW_DIR:output},stdio:"inherit",
 });
 const code=await new Promise((resolve,reject)=>{run.once("error",reject);run.once("exit",resolve);});
 if(code!==0)throw new Error("Campaign browser acceptance failed. Keep the output for diagnosis.");
 console.log("PASS: public campaign migration browser acceptance.");
 console.log("Review images:",output);
 console.log("Your existing development server and saved organizer session were not changed.");
} finally {
 stop();
 if(!exited)await Promise.race([new Promise(resolve=>server.once("exit",resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);
 if(!exited)server.kill("SIGKILL");
}
