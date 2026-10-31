import type {NextConfig} from 'next';
import {PHASE_DEVELOPMENT_SERVER} from 'next/constants';

export default function nextConfig(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    distDir: isDev ? '.next-dev' : '.next',
    devIndicators: false,
    reactStrictMode: true,
    productionBrowserSourceMaps: false,
    experimental: {
      webpackMemoryOptimizations: true,
      cpus: 1,
      workerThreads: false,
    },
    eslint: {
      ignoreDuringBuilds: true,
    },
    typescript: {
      ignoreBuildErrors: true,
    },
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'picsum.photos',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: 'uploads.mangadex.org',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: 'cdn.myanimelist.net',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: 's4.anilist.co',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: 'ahizfmtvgrfujoipmtdq.supabase.co',
          port: '',
          pathname: '/**',
        },
      ],
    },
    output: isDev ? undefined : 'standalone',
    transpilePackages: ['motion'],
    webpack: (config, {dev}) => {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      if (dev && process.env.DISABLE_HMR === 'true') {
        config.watchOptions = {
          ignored: /.*/,
        };
      }
      return config;
    },
  };
}
