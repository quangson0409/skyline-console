# Triển khai Console mới (skyline-console-new) lên lab

> Viết cho: kỹ sư vận hành/phát triển cần dựng hoặc cập nhật bộ **console mới + audit-proxy + backup-scheduler** trên cụm lab `ngs-poc-openstack`.
> Trạng thái thực tế: đã triển khai trên Deployment Node `10.0.29.5` ngày 2026-10-20 (cổng `8080`). Runbook vận hành của cụm: `runbook/28_RUNBOOK_TRIEN_KHAI_AUDIT_LOGS_VA_BACKUP_SCHEDULER.md` trong repo lab.

## 1. Tổng quan

Ba container chạy cạnh nhau trên Deployment Node, **không thay Skyline của Kolla** (`http://10.0.29.10:9999` vẫn chạy độc lập và là giao diện dự phòng):

| Container | Vai trò | Cổng | Mã nguồn |
| --- | --- | --- | --- |
| `console` | Giao diện React/Vite phục vụ bằng nginx | **8080** (duy nhất công bố ra ngoài) | thư mục gốc + `nginx.conf`, `Dockerfile` |
| `audit-proxy` | Reverse proxy ghi nhật ký mọi POST/PUT/PATCH/DELETE vào MariaDB; API xem log; nhận báo cáo từ scheduler | 8788 (nội bộ) | `audit-proxy/` |
| `backup-scheduler` | Lập lịch backup volume Cinder theo VM, retention kiểu Proxmox | 8787 (nội bộ) | `backup-scheduler/` |

```text
Trình duyệt ─► 10.0.29.5:8080  (console: nginx + React)
                 ├─ /               file tĩnh
                 ├─ /api/           ─► audit-proxy:8788 ─► Skyline VIP 10.0.29.10:9999 (Kolla)
                 ├─ /scheduler-api/ ─► audit-proxy:8788 ─► backup-scheduler:8787
                 └─ /audit-api/     ─► audit-proxy:8788  (API đọc log, xác thực bằng token Keystone)
backup-scheduler ─ CINDER_URL=http://audit-proxy:8788/upstream/cinder/v3/{project_id} ─► Cinder (ghi log backup tự động)
backup-scheduler ─ AUDIT_URL=http://audit-proxy:8788 ─► báo kết quả từng lần chạy / từng volume (kể cả lỗi)
audit-proxy ─► VIP 10.0.29.10:3306 (ProxySQL) ─► MariaDB Galera, database skyline_audit
```

Nếu `audit-proxy` dừng, console mới trả 502; Skyline Kolla vẫn dùng bình thường.

## 2. Yêu cầu

* Deployment Node `10.0.29.5`: Docker + Docker Compose v2, **có internet** (build image kéo `node:24-alpine`, `nginx:alpine` và `npm ci`), thư mục `/opt/skyline-console-new`. Node này **không có Node.js** → build bằng Docker, không build ở máy dev. Máy dev không cần Docker.
* Máy dev: SSH khóa công khai tới `root@10.0.29.5` (BatchMode), `tar`, `node` >= 24 (để chạy test), `bash` (Git Bash trên Windows).
* Quyền DB: tạo database/user qua **VIP ProxySQL** bằng `root_shard_0` (mật khẩu là `database_password` trong `/etc/kolla/passwords.yml`, script tự đọc, không in ra).
* Có thể restart cuốn chiếu `proxysql` trên 3 controller (xem bước 3). Cần cửa sổ ngắn: node giữ VIP gián đoạn DB vài giây.

## 3. Triển khai lần đầu

Mọi lệnh bí mật dùng file/biến môi trường; **không** viết mật khẩu vào lệnh, vào file compose hay vào tài liệu.

### Bước 1 — Đưa mã nguồn lên node

```bash
cd skyline-console-new
tar --exclude=node_modules --exclude=data --exclude='*.sqlite' -cf - audit-proxy backup-scheduler \
  | ssh root@10.0.29.5 'mkdir -p /opt/skyline-console-new && tar -xf - -C /opt/skyline-console-new'
scp deploy/docker-compose.lab.yml root@10.0.29.5:/opt/skyline-console-new/
```

### Bước 2 — Tạo database, bảng, user (một lần)

Trên `10.0.29.5`:

```bash
cd /opt/skyline-console-new/audit-proxy
DRY_RUN=1 MARIADB_HOST=10.0.29.10 ./scripts/provision-db.sh   # xem SQL (mật khẩu bị che), không đổi gì
MARIADB_HOST=10.0.29.10 ./scripts/provision-db.sh              # thực hiện
```

Kết quả: database `skyline_audit` (bảng `audit_events`, phân vùng theo tháng), `audit_app` (chỉ `SELECT, INSERT` trên `audit_events`), `audit_maint` (`SELECT, INSERT, ALTER, DROP, CREATE, INDEX`, chỉ cho job retention). Mật khẩu ghi vào `/etc/kolla/audit-proxy/` (`db.env`, `maint.env`, `proxysql-audit_*.yaml`), quyền `0600`.

### Bước 3 — Khai báo user trong ProxySQL và restart cuốn chiếu

ProxySQL đứng trước MariaDB và chỉ cho user nó biết đăng nhập (bài học LL-KOLLA-3 / INC-17). Cài file user lên **cả 3 controller**:

```bash
# từ 10.0.29.5, cho từng lab-controller-00, -01, -02
scp /etc/kolla/audit-proxy/proxysql-audit_app.yaml   lab-controller-XX:/etc/kolla/proxysql/users/audit_app.yaml
scp /etc/kolla/audit-proxy/proxysql-audit_maint.yaml lab-controller-XX:/etc/kolla/proxysql/users/audit_maint.yaml
ssh lab-controller-XX 'chmod 640 /etc/kolla/proxysql/users/audit_*.yaml'
```

Restart lần lượt, **node đang giữ VIP làm cuối** (xem bằng `ip -4 addr | grep 10.0.29.10`), chờ `healthy` mới sang node kế:

```bash
ssh lab-controller-00 'docker restart proxysql'
ssh lab-controller-01 'docker restart proxysql'
ssh lab-controller-02 'docker restart proxysql'
```

Kiểm tra: `docker exec proxysql ls /etc/proxysql/users | grep audit` ra 2 file ở mỗi node. Sau mỗi lần Kolla `reconfigure`/`upgrade` phải kiểm tra lại hai file này còn tồn tại.

### Bước 4 — Sinh bí mật cho scheduler

```bash
umask 077
printf 'SCHEDULER_SECRET=%s\nAUDIT_INTERNAL_SECRET=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" \
  > /etc/kolla/audit-proxy/scheduler.env
```

`SCHEDULER_SECRET` mã hóa credential lưu trong scheduler: **mất hoặc đổi secret thì các lịch hiện có không giải mã được** → sao lưu file này. `AUDIT_INTERNAL_SECRET` dùng chung giữa scheduler và audit-proxy.

### Bước 5 — Build image, chạy, kiểm tra

Dùng script (chạy từ gốc repo trên máy dev; xem §4):

```bash
deploy/redeploy.sh
```

Hoặc thủ công theo `deploy/redeploy.sh`. Compose: `/opt/skyline-console-new/docker-compose.lab.yml`; luôn chạy với `-f docker-compose.lab.yml` (thư mục không có `docker-compose.yml` mặc định).

## 4. Cập nhật (rebuild và restart)

Từ thư mục gốc repo `skyline-console-new` trên máy dev:

```bash
deploy/redeploy.sh                              # kiểm tra, upload, build và restart cả 3 dịch vụ
deploy/redeploy.sh console                      # chỉ giao diện
deploy/redeploy.sh backup-scheduler audit-proxy # chỉ hai dịch vụ nền
SKIP_TESTS=1 deploy/redeploy.sh                 # bỏ qua bước test cục bộ
```

Script làm 5 bước: (1) chạy `node --test` cho `audit-proxy` và `backup-scheduler`, `vite build` thử, kiểm tra `nginx.conf` không có BOM; (2) upload bằng `tar` qua SSH (không gửi `node_modules`, `.git`, dữ liệu SQLite, `scripts/.real.mjs`); (3) `docker build` trên node, giữ nguyên tên và tag; (4) `docker compose config -q` rồi `up -d` (chỉ tạo lại container có image đổi); (5) chờ healthy và gọi các endpoint health. Sau khi cập nhật console, nhấn **Ctrl+F5** trên trình duyệt.

Không cần đụng database, ProxySQL hay Skyline Kolla khi cập nhật bản thường. Dữ liệu `backup-scheduler-data` và bí mật trong `/etc/kolla/audit-proxy/` được giữ.

## 5. Kiểm tra sau triển khai

```bash
# trên 10.0.29.5
docker compose -f docker-compose.lab.yml ps                      # audit-proxy, backup-scheduler: (healthy)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/                       # 200
curl -s http://127.0.0.1:8080/audit-api/health                                         # {"status":"ok","queued":0,"dropped":0}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/scheduler-api/health   # 200
```

Giao diện: đăng nhập `http://10.0.29.5:8080`; mở **Maintenance → Audit Logs** (admin) hoặc **My Activity** (người dùng thường) thấy dòng Login có đủ user và project; **Storage → Backup Schedules → Create** hiện bảng chọn instance. Kiểm tra backup: tạo một lịch trên VM thử, "Run now", xem tab Run Details và các dòng `Backup Schedule Run` / `Backup Volume` trong Audit Logs (lọc nguồn Scheduler).

## 6. Bản đồ cấu hình

| Thành phần | File / biến | Ghi chú |
| --- | --- | --- |
| Compose | `deploy/docker-compose.lab.yml` | Biến không bí mật ghi trực tiếp; bí mật nạp bằng `env_file` |
| nginx của console | `nginx.conf` | `/api/`, `/scheduler-api/`, `/audit-api/` → `audit-proxy:8788`. **Không được có BOM** |
| audit-proxy | `DB_HOST`, `DB_USER`, `KEYSTONE_URL`, `UPSTREAM_API`, `UPSTREAM_SCHEDULER`, `UPSTREAM_CINDER`, `RETENTION_DAYS`, `AUDIT_INTERNAL_SECRET` | Bảng đầy đủ: `audit-proxy/README.md` |
| backup-scheduler | `KEYSTONE_URL`, `CINDER_URL`, `AUDIT_URL`, `TZ`, `MAX_VMS_PER_SCHEDULE`, `RUN_MAX_HOURS`, `MAX_CONCURRENT_RUNS`, `SCHEDULER_SECRET`, `AUDIT_INTERNAL_SECRET` | Bảng đầy đủ: `backup-scheduler/README.md` |
| Bí mật trên node | `/etc/kolla/audit-proxy/{db.env,maint.env,scheduler.env,proxysql-*.yaml}` | `0600`, thuộc root, **không** đưa vào git hay tài liệu |
| Phát triển cục bộ | `vite.config.js` | `/audit-api` → `127.0.0.1:8788`; đặt `AUDIT_PROXY_URL` để `/api` đi qua audit-proxy local. SQLite (`DB_DRIVER=sqlite`) chỉ dành cho test và máy dev, **không dùng cho lab** |

## 7. Vận hành

```bash
cd /opt/skyline-console-new
docker compose -f docker-compose.lab.yml logs --tail 50 audit-proxy
docker compose -f docker-compose.lab.yml restart backup-scheduler
docker compose -f docker-compose.lab.yml up -d --force-recreate console
```

* **Sao lưu cần giữ:** `/etc/kolla/audit-proxy/` (đặc biệt `scheduler.env`) và volume `backup-scheduler-data`. Database `skyline_audit` nằm trong Galera nên đi theo mariabackup của cụm.
* **Retention của audit log:** `RETENTION_DAYS` (mặc định 180). Job dọn dẹp chạy bằng `node src/maintenance.js` với user `audit_maint` (thêm 3 partition tháng kế tiếp, bỏ partition quá hạn). **Chưa cài lịch chạy tự động**; cho tới khi cài, bảng chỉ có partition `pmax`.
* **Khi `audit-proxy` dừng:** console mới trả 502, Skyline Kolla (`10.0.29.10:9999`) vẫn hoạt động. Container có `restart: unless-stopped` và healthcheck.

## 8. Rollback

```bash
cd /opt/skyline-console-new
docker compose -f docker-compose.lab.yml down              # giữ volume dữ liệu; thêm -v để xóa dữ liệu scheduler
```

* **Về phiên bản mã trước:** lấy lại mã cũ, chạy `deploy/redeploy.sh`. Không cần đụng DB (`retention: {"keep_last": n}` và các lịch `volume_id` cũ vẫn hợp lệ).
* **Gỡ hẳn:** xóa `/etc/kolla/proxysql/users/audit_*.yaml` trên 3 controller rồi restart cuốn chiếu `proxysql`; sau đó (chỉ khi không cần log) `DROP USER 'audit_app'@'10.0.29.%'; DROP USER 'audit_maint'@'10.0.29.%'; DROP DATABASE skyline_audit;`.

## 9. Xử lý sự cố

| Hiện tượng | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| `no configuration file provided: not found` | Thiếu `-f docker-compose.lab.yml` | Thêm `-f docker-compose.lab.yml` hoặc dùng `deploy/redeploy.sh` |
| Container `console` khởi động lại liên tục, log `unknown directive "﻿server"` | `nginx.conf` có BOM UTF-8 | Bỏ 3 byte đầu `EF BB BF`, build lại image console |
| `audit-proxy` không ghi được DB / `Access denied for user 'audit_app'` | ProxySQL chưa nạp user | Kiểm tra 2 file yaml trên cả 3 controller rồi restart cuốn chiếu `proxysql` (bước 3) |
| Console 502 | `audit-proxy` đang khởi động lại hoặc đã dừng | `docker compose ... ps` và `logs audit-proxy`; Skyline Kolla vẫn dùng được |
| Audit Logs trống dù có thao tác | `/api` không đi qua `audit-proxy` (dev server không đặt `AUDIT_PROXY_URL`) hoặc DB lỗi | Xem `/audit-api/health` (`queued` tăng mà không giảm = không ghi được DB) |
| Lịch backup báo `volume is in-use and force_in_use is disabled` | Lịch cũ (một volume) chưa bật "Back up attached volumes" | Bật công tắc, hoặc tạo lịch mới theo VM (tự dùng `force`) |
| Lần chạy backup lỗi nhưng Audit không có dòng | `AUDIT_URL`/`AUDIT_INTERNAL_SECRET` chưa đặt cho scheduler | Kiểm tra `docker exec skyline-console-backup-scheduler-1 env \| grep AUDIT` |
| Credential trong lịch không dùng được sau khi dựng lại scheduler | `SCHEDULER_SECRET` đổi hoặc mất | Khôi phục đúng secret cũ từ bản sao lưu; nếu không, sửa từng lịch và nhập lại credential |

## 10. Giới hạn và việc còn lại

* `audit-proxy` chỉ thấy lưu lượng đi qua `/api/` của console. Thao tác gọi thẳng endpoint OpenStack (CLI, Horizon) cần Keystone audit (CADF) — chưa làm.
* Job retention hằng ngày cho `skyline_audit` chưa được lên lịch.
* Backup scheduler dùng driver backup của cụm (Ceph pool `backups`, cùng cụm HDD với volume). Chọn đích khác (NFS/NetApp/TrueNAS) cần thêm một dịch vụ `cinder-backup` thứ hai trong AZ riêng; chưa triển khai.
* Một node đơn (`10.0.29.5`) chạy cả ba container; chưa có HA cho `audit-proxy`.
