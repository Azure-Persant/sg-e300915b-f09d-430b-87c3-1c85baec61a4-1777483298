/** @type {import('next').NextConfig} */
import { createRequire } from "module";

// Check if element-tagger is available
function isElementTaggerAvailable() {
  try {
    const require = createRequire(import.meta.url);
    require.resolve("@softgenai/element-tagger");
    return true;
  } catch {
    return false;
  }
}

// Build turbo rules only if tagger is available
function getTurboRules() {
  if (!isElementTaggerAvailable()) {
    console.log(
      "[Softgen] Element tagger not found, skipping loader configuration"
    );
    return {};
  }

  return {
    "*.tsx": ["@softgenai/element-tagger"],
    "*.jsx": ["@softgenai/element-tagger"],
  };
}

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    turbo: {
      rules: getTurboRules(),
    },
  },
  images: {
    // Scoped to the hosts that actually serve images. It was hostname "**",
    // which let anyone pass any URL to /_next/image and use this deployment as
    // an open image proxy on our bandwidth.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.gatcg.com",
        pathname: "/cards/images/**",
      },
      {
        // Profile pictures from a Google sign-in.
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
    // Card art never changes once printed, so there is no reason to re-fetch it
    // from gatcg. Optimised copies are held at the edge for 30 days, which is
    // what turns "every visitor hits gatcg" into "we hit gatcg once per image".
    minimumCacheTTL: 60 * 60 * 24 * 30,
    formats: ["image/avif", "image/webp"],
  },
  allowedDevOrigins: ["*.daytona.work", "*.softgen.dev"],
};

export default nextConfig;
