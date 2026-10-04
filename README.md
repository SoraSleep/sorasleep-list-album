# SoraSleep List

Ghép danh sách bài hát thành video 16:9.

## Cài trên Windows

1. Cài [Node.js LTS](https://nodejs.org)
2. Clone repo:

```bat
git clone https://github.com/SoraSleep/sorasleep-list-album.git
cd sorasleep-list-album
npm install
```

3. Đóng gói installer:

```bat
set CSC_IDENTITY_AUTO_DISCOVERY=false
set ELECTRON_BUILD=1
npm run dist
```

Hoặc chạy `dist-win.cmd`. File cài: `release\SoraSleep-List-Setup.exe`.

Installer tạo shortcut **SoraSleep List** trên desktop và Start Menu.

## Cập nhật

Sau khi đã cài EXE, nút **Cập nhật** trên thanh trên kiểm tra GitHub Releases. Repo private: lần đầu sẽ hỏi GitHub token (scope `repo`). Token lưu trên máy, không đẩy lên git.

Đẩy bản mới từ máy Windows:

1. Tăng `version` trong `package.json`
2. `git push`
3. Đăng nhập GitHub CLI rồi:

```bat
gh auth login
set GH_TOKEN=
for /f %i in ('gh auth token') do set GH_TOKEN=%i
set CSC_IDENTITY_AUTO_DISCOVERY=false
set ELECTRON_BUILD=1
npm run release
```

## Dev

```bat
npm run dev
```

Mở `http://127.0.0.1:8080`. Cửa sổ Electron trỏ vào đó: `npm run app`.
