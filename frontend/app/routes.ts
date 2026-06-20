import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/chat.tsx"),
  route("characters", "routes/characters.tsx"),
  route("trpg", "routes/trpg.tsx"),
  route("tools", "routes/tools.tsx"),
  route("memory", "routes/memory.tsx"),
  route("preset", "routes/preset.tsx"),
  route("world-info", "routes/world-info.tsx"),
  route("knowledge-base", "routes/knowledge-base.tsx"),
  route("regex", "routes/regex.tsx"),
  route("ui-template", "routes/ui-template.tsx"),
  route("profile", "routes/profile.tsx"),
  route("settings", "routes/settings.tsx"),
  route("about", "routes/about.tsx"),
] satisfies RouteConfig;
