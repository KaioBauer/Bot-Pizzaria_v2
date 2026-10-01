@echo off
title Vianna Pizzaria - servidor local
cd /d "%~dp0"
echo.
echo   Vianna Pizzaria - ligando bot (Telegram) e painel...
echo   Painel:   http://localhost:3000/admin
echo   Cardapio: http://localhost:3000/cardapio
echo   Para desligar: feche esta janela ou aperte Ctrl+C
echo.
start "" /b cmd /c "timeout /t 12 /nobreak >nul && start http://localhost:3000/admin"
call pnpm dev
pause
