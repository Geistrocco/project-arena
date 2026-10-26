import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/turnaje/*/vysledky.pdf": ["./assets/fonts/DejaVuSans.ttf"] },
};

export default nextConfig;
