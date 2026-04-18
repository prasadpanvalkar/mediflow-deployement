const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
    typescript: { ignoreBuildErrors: true },
    eslint: { ignoreDuringBuilds: true },
    transpilePackages: ['@mediflow/constants'],
    webpack: (config) => {
        config.resolve.modules = [
            ...(config.resolve.modules ?? ['node_modules']),
            path.resolve(__dirname, '../../node_modules'),
        ];
        return config;
    },
};

module.exports = nextConfig;
