import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["passkit-generator", "@prisma/client"],
  outputFileTracingIncludes: {
    "/api/wallet/**": ["./wallet-assets/**"],
  },
};

export default nextConfig;
