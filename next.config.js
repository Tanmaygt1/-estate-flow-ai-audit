/** @type {import('next').NextConfig} */
const nextConfig = {
  // nodemailer is server-only — tell webpack to ignore it on the client
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false, tls: false, fs: false,
        dns: false, child_process: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
