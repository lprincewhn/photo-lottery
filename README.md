# photo-lottery
纯前端人物照片抽签器：选择本地照片目录，随机抽取并展示人物照片与姓名，无需上传照片。

## 使用

打开站点，点击「选择照片文件夹」（包含子文件夹），或使用「多选图片导入」。
文件名去掉最后一个扩展名作为姓名，例如 `张三.jpg`。默认每人一张照片，
同名只保留按路径排序后的第一张有效照片，并显示跳过原因。

点击「开始抽签」，再点击「停止」揭晓照片和姓名。默认不重复抽取，
全部抽完后可「重置抽签」；重置保留照片、清空记录。取消不重复选项可重复抽取，
重新勾选后所有历史中奖者都会被排除。空格键可在页面空白处或抽签按钮上开始／停止。
支持全屏展示和减少动态效果的系统偏好。

照片、名单和结果仅存在当前浏览器页面内，没有后端、数据库、分析脚本或外部依赖。
刷新或关闭后不会保存，需要重新选择照片。支持 JPG、PNG、WebP、GIF、BMP、AVIF
（具体解码能力取决于浏览器），损坏文件会被跳过。一次最多 2000 个文件，
单张不超过 25 MB；大型原图建议提前缩小，以降低现场电脑的内存占用。
普通目录选择需要用户授权，网页不会自行扫描电脑。

## 随机机制

轮播动画按顺序展示候选照片，不决定结果。点击停止时才独立使用
`crypto.getRandomValues()` 生成随机数，通过拒绝采样避免取模偏差，
从当前可抽取名单等概率选出一人。不会使用 `Math.random()` 作为中奖源。
纯前端适合单机现场活动，不提供防篡改、公证或跨设备同步保证。

## 开发

无需安装运行时依赖，也无需构建。`public/` 是全部静态产物，
可直接打开 `public/index.html`，或用任意静态服务器提供该目录。

Node.js 22+ 下运行核心逻辑用例：

```sh
npm test
```

浏览器端回归使用 Playwright（仅开发依赖，不会发布到站点）：

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

覆盖文件夹／多选导入、坏图和重名、抽签／不重复／重置、空格键、移动布局、
减少动态效果偏好，以及导入和抽签期间没有网络请求。

## nginx 部署

站点配置模板在 `deploy/lottery.svhw.tech.conf`，独立匹配 `lottery.svhw.tech`，
不会替换其他站点。只发布 `public/`，不要把仓库根目录暴露给 nginx。
部署使用版本化目录，`current` 软链接切换可回退到旧版本。

```sh
release="/var/www/photo-lottery/releases/$(git rev-parse --short HEAD)"
sudo install -d "$release"
sudo install -m 644 public/* "$release/"
sudo ln -s "$release" /var/www/photo-lottery/current.next
sudo mv -Tf /var/www/photo-lottery/current.next /var/www/photo-lottery/current
# 首次部署才安装该模板；启用 HTTPS 后不要用 HTTP 模板覆盖现有配置。
sudo install -m 644 deploy/lottery.svhw.tech.conf /etc/nginx/sites-available/lottery.svhw.tech
sudo ln -s /etc/nginx/sites-available/lottery.svhw.tech /etc/nginx/sites-enabled/lottery.svhw.tech
sudo nginx -t && sudo systemctl reload nginx
curl --resolve lottery.svhw.tech:80:127.0.0.1 http://lottery.svhw.tech/
```

公网访问需要先把 `lottery.svhw.tech` 的 DNS A 记录指向服务器公网 IPv4；
有 IPv6 服务时再配置 AAAA，并放通 80/443。
DNS 生效后可在服务器使用已有 Certbot 获取证书：

```sh
sudo certbot --nginx -d lottery.svhw.tech --redirect
```

HTTP 也能使用本地选图和安全随机数，但正式活动建议启用 HTTPS，防止页面在传输中被修改。
