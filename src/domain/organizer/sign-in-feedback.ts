export type SignInIssue="invalid-link"|"expired-link"|null;
export type SignInFeedback={kind:"accepted"|"retry"|"limited";message:string};
export function signInIssue(error:unknown):SignInIssue{
  if(typeof error!=="string")return null;
  if(["TOKEN_EXPIRED","EXPIRED_TOKEN","MAGIC_LINK_EXPIRED"].includes(error))return "expired-link";
  if(["INVALID_TOKEN","INVALID_MAGIC_LINK","INVALID_SIGNATURE","VERIFICATION_ERROR"].includes(error))return "invalid-link";
  return error?"invalid-link":null;
}
export function signInIssueMessage(issue:SignInIssue):string{
  return issue==="expired-link"?"That sign-in link has expired. Request a fresh link below.":issue==="invalid-link"?"That sign-in link could not be used. It may have expired or already been used. Request a fresh link below.":"";
}
/** Response acceptance is not a claim of inbox delivery or campaign membership. */
export async function requestSignIn(send:()=>Promise<unknown>):Promise<SignInFeedback>{
  try{
    const result=await send();
    if(!result||typeof result!=="object"||!("error" in result)||result.error===undefined)return {kind:"retry",message:"Sign-in could not be confirmed. Please retry shortly."};
    if(result.error){
      const error=result.error as {status?:unknown;code?:unknown};
      if(error.status===429||error.code==="TOO_MANY_REQUESTS")return {kind:"limited",message:"Too many sign-in requests. Wait a minute before trying again."};
      return {kind:"retry",message:"Sign-in is temporarily unavailable. Please retry shortly."};
    }
    return {kind:"accepted",message:"If this address has organizer access, a sign-in link will arrive shortly. Check your inbox. Requesting a link does not grant campaign access."};
  }catch{return {kind:"retry",message:"We couldn’t confirm your request. Check your connection and try again."};}
}
