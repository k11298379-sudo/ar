@echo off
chcp 65001 >nul
title AR Emerald City Server
cd /d "%~dp0"
python server.py
if errorlevel 1 pause
