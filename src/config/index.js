// src/config/index.js

import connectAtxDemo from "./connectAtxDemo";

export const CONFIGS = {
  "connect-atx-elite": connectAtxDemo,
};

export function getConfigBySlug(slug = "connect-atx-elite") {
  return CONFIGS[slug] || connectAtxDemo;
}

