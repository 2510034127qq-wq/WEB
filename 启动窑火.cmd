@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更新版本，再双击启动。
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo 首次运行源码：请先执行 npm ci 和 npm run build。
  pause
  exit /b 1
)
node scripts\serve.mjs --open
pause
