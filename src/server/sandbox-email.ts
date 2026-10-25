import "server-only";
/** Preserve the existing development identity until the final owner handoff. */
const approvedRecipient="arodgps@gmail.com";
export function sandboxEmailRecipient():string|null{
  if(process.env.NODE_ENV==="production")return null;
  const value=process.env.FF_TEST_ORGANIZER_EMAIL?.trim().toLowerCase();
  return value===approvedRecipient?value:null;
}
export function isSandboxEmailRecipient(value:string):boolean{
  const approved=sandboxEmailRecipient();
  return Boolean(approved&&value.trim().toLowerCase()===approved);
}
export function requireSandboxEmailRecipient(value:string):void{
  if(!isSandboxEmailRecipient(value))throw new Error("Sandbox email recipient is not allowed.");
}
