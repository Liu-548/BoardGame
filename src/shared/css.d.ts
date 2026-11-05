declare module "*.css";

// import.meta.glob của Vite (dự án không nạp kiểu vite/client vì đụng kiểu của Cloudflare Workers).
interface ImportMeta {
  glob(pattern: string, options: { eager: true; query: "?url"; import: "default" }): Record<string, string>;
}
