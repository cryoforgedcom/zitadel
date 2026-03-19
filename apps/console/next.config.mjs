/** @type {import('next').NextConfig} */
const nextConfig = {
  // Console always serves under /console — both self-hosted and in cloud
  basePath: "/console",
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
