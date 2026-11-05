import type { NextConfig } from "next";

const config: NextConfig = {
  // Собирает сайт в самостоятельную папку — так его проще запускать в Docker на любом сервере.
  output: "standalone",
  poweredByHeader: false,
};

export default config;
