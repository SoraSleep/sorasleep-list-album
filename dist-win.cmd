@echo off
setlocal
cd /d "%~dp0"
set CSC_IDENTITY_AUTO_DISCOVERY=false
set ELECTRON_BUILD=1
echo.
echo === Dong goi SoraSleep List ===
call npm run dist
if errorlevel 1 goto :fail
echo.
echo XONG. Cai dat: release\SoraSleep-List-Setup.exe
exit /b 0

:fail
echo.
echo LOI. Copy toan bo doan do o tren gui lai.
exit /b 1
