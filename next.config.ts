import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone: the Docker image ships that, not node_modules.
  output: "standalone",
  // The bundled datasets are read with fs at request time; make sure the trace keeps them.
  outputFileTracingIncludes: { "/**": ["./data/**/*"] },
};

export default nextConfig;
