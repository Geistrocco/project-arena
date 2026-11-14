import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers(){return [{source:"/pozvanka/:path*",headers:[{key:"Referrer-Policy",value:"no-referrer"},{key:"Cache-Control",value:"private, no-store"}]}];},
  outputFileTracingIncludes: { "/turnaje/*/vysledky.pdf": ["./assets/fonts/DejaVuSans.ttf"] },
};

export default nextConfig;
