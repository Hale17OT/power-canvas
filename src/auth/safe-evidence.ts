import {isSecretKey,redactText} from '../core/logging.js';
/** Reject rather than save credential-shaped data; caller supplies an explicit metadata-only projection. */
export function assertAuthEvidenceSafe(value:unknown,depth=0):void{
 if(depth>40)throw Error('Authentication evidence nesting limit');
 if(typeof value==='string'&&(redactText(value)!==value||/-----BEGIN [^-]*(?:PRIVATE KEY|CERTIFICATE)-----|\b(?:access_token|refresh_token|client_secret|password|set-cookie)\s*[:=]/i.test(value)))throw Error('Sensitive authentication evidence rejected');
 if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){const statusOnly=key==='authorization'&&typeof item==='string'&&['NOT_REQUESTED','REQUIRED','PENDING_REVIEW','DENIED'].includes(item);if(!statusOnly&&(isSecretKey(key)||/^(?:privatekey|certificate|clientcertificate|tokenCache|cookieJar|cookies)$/i.test(key.replace(/[-_ ]/g,''))))throw Error('Sensitive authentication evidence key rejected');assertAuthEvidenceSafe(item,depth+1);}
}
