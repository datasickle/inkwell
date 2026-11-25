"""生成站点分享卡片 public/og.png（1200×630）。

为什么是固定一张而不是按文章生成：
Cloudflare 的构建镜像是 Linux，没有中文字体；按标题动态出图必须把整个
中文字体（约 17MB）提交进仓库，为了一个分享图不值当。所以这里做一张
统一的品牌卡，本地生成后提交，所有页面共用。

改动文案后重新跑一次即可：
    python tools/make-og.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "og.png"

W, H = 1200, 630
BG = "#fafafa"
INK = "#171717"
MUTED = "#737373"
FAINT = "#b8b8b8"
DECOR = "#f0f0f0"

# 站点信息（与 site.json 保持一致）
BRAND = "datasickle's blog"
TAGLINE = "偶尔记点东西。"
DOMAIN = "datasickle-blog.pages.dev"

NORMAL = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\Deng.ttf",
]
BOLD = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\Dengb.ttf",
]


def load(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for path in BOLD if bold else NORMAL:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    raise SystemExit("找不到可用字体，请在本机确认 C:\\Windows\\Fonts\\msyh.ttc")


img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# 右下角一个极淡的大圆，压在最底层。刻意让它被画布切掉一角，
# 避免出现"一个完整的圆贴在图中间"那种廉价模板感。
d.ellipse([1150 - 240, 560 - 240, 1150 + 240, 560 + 240], fill=DECOR)

pad = 88

# 品牌名
f_brand = load(68, bold=True)
d.text((pad, 170), BRAND, font=f_brand, fill=INK)

# 一句话简介
f_tag = load(36)
d.text((pad, 272), TAGLINE, font=f_tag, fill=MUTED)

# 一条短细线，做视觉分层
d.rectangle([pad, 396, pad + 64, 400], fill=FAINT)

# 域名
f_domain = load(26)
d.text((pad, 430), DOMAIN, font=f_domain, fill=FAINT)

img.save(OUT, "PNG", optimize=True)
print(f"已生成 {OUT}  {OUT.stat().st_size / 1024:.0f} KB  {W}x{H}")
