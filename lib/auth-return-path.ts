// Accept only routes used by authentication and child joining, never arbitrary URLs.
export function authReturnPath(value:unknown):string {
 if(typeof value!=="string")return "/ucet";
 if(["/ucet","/nove-heslo","/pripojit-sa","/ziadosti-hracov"].includes(value))return value;
 if(/^\/pozvanka\/[a-f0-9]{64}$/.test(value))return value;
 if(/^\/pripojit-sa\?hrac=[a-f0-9-]{36}$/i.test(value))return value;
 return "/ucet";
}
