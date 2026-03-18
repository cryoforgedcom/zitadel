/** @type {import('next').NextConfig} */
const nextConfig = {
  // In cloud mode, the console is served under /admin on zitadel.com
  basePath: process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === "cloud" ? "/admin" : "",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Required for @connectrpc/connect-node (gRPC)
  serverExternalPackages: ["@connectrpc/connect-node"],
};

export default nextConfig;
