import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // Proxy all /api/v1/* calls to the FastAPI backend.
    // This way the browser never makes cross-origin requests.
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8001";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
