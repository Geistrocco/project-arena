// Keep authentication and recovery reachable, but never registration or app data.
const publicRoutes = new Set(["/pripravujeme","/prihlasenie","/zabudnute-heslo","/nove-heslo","/auth/callback","/robots.txt","/sitemap.xml"]);
export function publicTestingRoute(path: string, method: string): boolean {
  return (method === "GET" || method === "HEAD") && publicRoutes.has(path);
}
