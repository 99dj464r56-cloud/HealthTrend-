@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul && (py -3 serve.py 8765 & goto :eof)
where python >nul 2>nul && (python serve.py 8765 & goto :eof)
echo 需要安装 Python 3：https://www.python.org/downloads/ （安装时勾选 Add to PATH）
pause
