const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
    typescript: { ignoreBuildErrors: true },
    eslint: { ignoreDuringBuilds: true },
    webpack: (config) => {
        // In an npm workspaces monorepo, packages are hoisted to the root node_modules.
        // Add the workspace root so webpack can resolve hoisted packages like react-webcam.
        config.resolve.modules = [
            ...(config.resolve.modules ?? ['node_modules']),
            path.resolve(__dirname, '../../node_modules'),
        ];
        return config;
    },
};

module.exports = nextConfig;
