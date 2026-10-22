/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Mend has no optimized-image dependency; keep this unused endpoint closed.
  images: { unoptimized: true },
  productionBrowserSourceMaps: false,
};
export default nextConfig;
