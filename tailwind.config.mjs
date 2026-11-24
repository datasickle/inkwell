import typography from "@tailwindcss/typography";

/**
 * 视觉基调来自 Astro Nano（stone 灰阶 + 大留白）。
 * 唯一改动：字体栈换成中文优先。
 * Nano 原本用 @fontsource 的 Inter / Lora，这两个字体没有中文字形，
 * 中文会 fallback 成浏览器默认（Windows 上常是宋体），所以这里直接不装，
 * 改成系统中文栈——既省掉 4 个 woff2 的体积，观感也统一。
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: ["class"],
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Noto Sans SC"',
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
        // 只用于少数点缀（如数字、英文引文），未安装任何 webfont
        serif: ['Georgia', '"Songti SC"', '"Noto Serif SC"', "serif"],
        mono: [
          '"SF Mono"',
          '"JetBrains Mono"',
          'Menlo',
          'Consolas',
          '"Liberation Mono"',
          "monospace",
        ],
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: "none",
            fontSize: "1.0625rem", // 17px，中文 16px 略紧
            lineHeight: "1.85",
            p: {
              marginTop: "1.5em",
              marginBottom: "1.5em",
            },
            // 中文正文里 h2 默认 1.5em 会和文章大标题撞成同一个尺寸，
            // 压到 1.35em 把层级拉开（30px 标题 / 23px h2 / 17px 正文）
            h2: {
              fontSize: "1.35em",
              marginTop: "2em",
              marginBottom: "0.75em",
            },
            h3: {
              fontSize: "1.15em",
              marginTop: "1.7em",
              marginBottom: "0.6em",
            },
            "code::before": { content: "none" },
            "code::after": { content: "none" },
            code: {
              fontWeight: "400",
              fontSize: "0.9em",
              padding: "0.15em 0.4em",
              borderRadius: "0.3rem",
            },
            "pre code": {
              padding: "0",
              fontSize: "0.875em",
              borderRadius: "0",
            },
            pre: {
              borderRadius: "0.5rem",
              padding: "1.1rem 1.25rem",
            },
            "ul > li::marker, ol > li::marker": {
              color: "currentColor",
              opacity: "0.35",
            },
            blockquote: {
              fontWeight: "400",
              fontStyle: "normal",
              borderLeftWidth: "2px",
            },
            "blockquote p:first-of-type::before": { content: "none" },
            "blockquote p:last-of-type::after": { content: "none" },
            hr: { marginTop: "3em", marginBottom: "3em", opacity: "0.4" },
            img: { borderRadius: "0.5rem" },
          },
        },
      },
    },
  },
  plugins: [typography],
};
