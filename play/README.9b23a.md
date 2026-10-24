# web-mobile 满屏构建模板

Cocos Creator 2.4 会把本目录文件在构建结束后拷到 `build/web-mobile/`。

- **优先依赖** `style-mobile.06358.css`（覆盖默认样式，兼容 `md5Cache=true`）。
- `index.56d5e.html` 仅作无 hash / 参考骨架；带 md5 的正式包请保留构建生成的 index，再跑仓库根 `tools/patch-web-mobile-fullscreen.sh`。
