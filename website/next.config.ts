import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fmukgsxfnqcahdgxkvce.supabase.co",
      },
    ],
  },
};

export default nextConfig;
