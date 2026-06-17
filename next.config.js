/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium', 'exceljs'],
  },
  webpack: (config) => {
    // Needed for puppeteer-core in serverless
    config.externals = [...(config.externals || []), 'canvas', 'jsdom']
    return config
  },
}

module.exports = nextConfig
