import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.trycloudflare.com", "192.168.0.104"],
  devIndicators: false,
};


export default nextConfig;
