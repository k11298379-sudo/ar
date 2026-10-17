@echo off
chcp 65001 >nul
echo ========================================================
echo   Отключение сайта oz-ar-theater.surge.sh...
echo ========================================================
echo.
call npx surge teardown oz-ar-theater.surge.sh
echo.
echo --------------------------------------------------------
echo   Сайт oz-ar-theater.surge.sh успешно отключен!
echo   Теперь он недоступен в интернете.
echo.
echo   Чтобы снова включить, запустите: deploy.bat
echo --------------------------------------------------------
echo.
pause
