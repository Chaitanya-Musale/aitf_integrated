/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  },
  experimental: {
    serverComponentsExternalPackages: [],
  },
  // Enable standalone output for Docker
  output: 'standalone',
}

module.exports = nextConfig