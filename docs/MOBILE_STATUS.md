# Liana 手機版狀態文件
> 最後更新：2026-06-03

## 技術架構
- **框架**：React 18 + TypeScript，建置工具 Vite 5，路由用 `react-router-dom` v6（`BrowserRouter`）。UI 全部為 inline style，無 CSS 框架。
- **部署**：PWA（`vite-plugin-pwa`，`registerType: 'autoUpdate'`，standalone / portrait）。Manifest 定義在 `vite.config.ts` 而非靜態 `public/manifest.json`；`public/` 只有 `icon-192.png`、`icon-512.png`。專案根目錄 `.vercel` 已被 gitignore，推測以 Vercel 部署。
- **API 連接方式**：前端直接呼叫 Supabase JS client（`@supabase/supabase-js` v2）。Supabase URL 與 anon（publishable）key 硬編碼在 `src/lib/supabase.ts`。資料存取主要透過 `src/hooks/useTasks.ts` 與 `src/hooks/useCategories.ts`，直接對 Supabase 資料表查詢/寫入，無後端 API 層。

## 目前已實作的功能
- **登入**（完整）：Email + 密碼登入（`supabase.auth.signInWithPassword`），有 session 持久化與 `onAuthStateChange` 監聽（`src/App.tsx`）。
- **快速記錄 / Capture**（完整）：輸入任務標題、選分類、選到期日，Enter 快速儲存，成功 toast、錯誤提示。樂觀新增（`useTasks.createTask`）。
- **今日焦點 / Focus**（完整）：依到期日分組顯示「逾期 / 今天到期 / 未來 7 天 / 等待中（被阻擋）」，含到期 badge 與空狀態。
- **全部任務 / Tasks**（大致完整）：依分類篩選（橫向 chip），分「進行中 / 已完成」兩區。
- **任務詳情 / TaskDetail**（可編輯）：標題、備註、分類、到期日皆可直接編輯並自動儲存（標題/備註防抖 ~900ms，分類/到期日選定即存，成功顯示低調「已儲存」）；另顯示狀態 badge、前置任務、子任務，可切換完成。重複規則僅顯示 🔁 標記、不可編輯。
- **完成切換**（完整）：三個頁面皆可勾選完成，樂觀更新（`completed` 0/1）。
- **任務依賴顯示**（僅顯示）：`useTasks` 計算 `blockedIds`，被前置任務阻擋者顯示 🔒，詳情頁顯示「等待前置任務」與前置清單。
- **分類顯示**（唯讀）：`useCategories` 讀取分類，用於篩選與色點顯示。
- **PWA 安裝**（完整）：可加到主畫面、autoUpdate。
- **今日狀態 / Today**（階段 5-A）：第 4 個分頁（記錄 / 焦點 / 今日 / 任務），目前含「每日指標」今日輸入區塊（防抖 ~900ms 自動儲存、低調「已儲存」提示、失敗沿用 0A 提示）；「每日節律」區塊預留待階段 5-B。

## 尚未實作的功能（對比桌面版）
以下為桌面版已有、手機版尚未實作者：
- **每日節律（Daily Rhythm）**：無，程式碼完全沒有相關頁面或查詢。
- ⏳ **每日指標（Daily Metrics，部分實作，階段 5-A）**：手機端新增「今日狀態」頁，可輸入/修改「今日數值」（依指標 `type` 分流寫入 `value_number` / `value_text`，以 `(metric_id, date)` 為衝突鍵 upsert、不重複桌面的當日紀錄；日期 key 用 `getDailyDateKey()`）。指標的新增/編輯/刪除管理仍留在桌面版（`daily_metrics` 手機端唯讀）。
- **每日軌跡（Daily Track）**：無。
- **收成紀錄（Harvest）**：無。
- **冷藏清單**：無。
- **行事曆**：無（僅有單一任務的 due_date 文字，沒有月曆/週曆視圖）。
- **關係圖**：無（依賴關係只用清單與 🔒 呈現，無圖形化）。
- **批次操作**：無（無多選、無批次完成/刪除/移動）。
- **任務依賴關係**：僅能「顯示」被阻擋狀態與前置清單；**無法新增、編輯或移除依賴**（`task_dependencies` 只讀不寫）。
- **重複任務**：僅在詳情頁顯示 🔁 標記（依 `recurrence_rule` 是否存在）；**無法設定重複規則，也沒有重複任務的自動生成邏輯**。
- **其他（依程式碼判斷）**：
  - ✅ **編輯任務（已實作，階段 2-A）**：標題、備註（detail）、分類、到期日可在 TaskDetail 直接編輯並自動儲存。重複規則、`parent_id`、`starred`、`manual_order`、`completed` 等欄位不在編輯範圍、儲存時原封不動。
  - ✅ **刪除任務（已實作，階段 2-B）**：軟刪除（寫入 `deleted_at`，不真的移除），詳情頁有「刪除任務」按鈕、列表長按該列觸發；刪除後底部出現「已刪除／復原」提示約 5 秒，點復原即把 `deleted_at` 清回 null。被軟刪除者於所有查詢隱藏。
  - **建立子任務**：詳情頁可看子任務，但無法新增（`createTask` 固定 `parent_id: null`）。
  - ✅ **星標 / starred（已實作，階段 2-B）**：詳情頁與列表（Tasks / Focus）的任務列皆有星星開關，點擊切換 `starred` 0/1（樂觀更新、失敗退回）。此階段僅做加星與顯示，未改動排序。
  - **手動排序**：依 `manual_order` 排序顯示，但無拖曳/重排 UI。
  - **分類管理（CRUD）**：分類只讀，無新增/改色/刪除。
  - ✅ **搜尋（已實作，階段 3）**：全部任務頁有標題即時搜尋（不分大小寫、部分符合、純前端篩選），與分類篩選疊加；空結果顯示「沒有符合的任務」。進階篩選（依日期/星標等）仍無。建立子任務已決定不做（見設計總則）。
  - **註冊新帳號 / 忘記密碼**：登入畫面只有登入，無註冊或重設密碼。

## 與桌面版的資料同步
- **共用的 Supabase 資料表**：`tasks`、`categories`、`task_dependencies`。手機與桌面連同一個 Supabase 專案（`svdtwblpjwdkjpvzsvpt`），以 `user_id` 區隔資料。
- **目前同步狀況（手機建立的任務電腦是否看得到）**：可以。寫入的是同一個資料庫的同一張 `tasks` 表、同一個 `user_id`，桌面端重新載入即可看到手機建立的任務，反之亦然。
- **已知同步問題**：
  - **無 realtime 訂閱**：手機端只在元件掛載或切換分類時 `load()`，不會即時收到其他裝置的變更。**階段 4 已加入下拉刷新**：在 Focus / Tasks 列表頂端下拉即可手動重新抓取最新資料（保留目前的分類篩選、搜尋字與排序）；realtime 即時訂閱仍待評估。
  - **樂觀更新不重載**：`toggleComplete` 改完不重新抓取，多裝置同時操作可能短暫不一致。
  - **時間戳由前端產生**：`created_at` / `updated_at` 由裝置本地時鐘以 ISO 字串寫入，跨裝置時鐘不同步時排序可能受影響。
  - **`manual_order` 寫入固定值**：`useTasks.createTask` 一律寫入 `9999`，與桌面版的排序基準是否一致尚未驗證。（先前 `lib/api.ts` 用 `Date.now()` 的分歧已隨該死碼於階段 1 刪除而消失。）

## 已知問題與限制
- ✅ **`src/lib/api.ts` 死碼（已修復，階段 1）**：確認全專案無任何 import 後已整檔刪除。App 走 `hooks/useTasks.ts` + `lib/supabase.ts`，不再有與 `useTasks` 行為不同的重複邏輯（`manual_order`、舊 UTC 日期算法）。
- ✅ **`Tasks.tsx` CSS bug（已修復，階段 1）**：第 29 行 `calc(20px + env(safe-area-inset-top)` 補上缺少的右括號，`calc()` 正確閉合，瀏海安全區 padding 恢復生效。
- ✅ **時區邊界（已修復，階段 0B）**：原本 `daysFromToday` 用 `new Date('YYYY-MM-DD')`（UTC 午夜）混本地 `setHours`、`todayStr` 用 `toISOString().slice(0,10)`（UTC 日期），跨日時段會差一天。現已統一為單一算法 `getDailyDateKey()`：一律用本地時間，並套用凌晨 4 點換日（`DAILY_RESET_HOUR = 4`），與桌面版一致；`todayStr` / `daysFromToday` 皆改為以此為基準（`daysFromToday` 用本地午夜相減 + 四捨五入避開 DST）。
- **寫入皆需連線、無離線佇列**：雖是 PWA，但建立/完成任務都直接打 Supabase。失敗時會依原因區分提示（未登入 / 登入失效 / 其他），**不再一律說成「離線」**，並把畫面狀態回正（階段 0A）。仍**刻意不做**離線佇列、自動重試、衝突解決或快取寫入。
- ✅ **未登入假成功（已修復，階段 0A）**：`useTasks.createTask` 寫入前先檢查 `supabase.auth.getSession()`，無 session 直接拋出 `NOT_AUTHENTICATED`，不做樂觀新增、不顯示成功；Capture 改顯示「尚未登入，無法儲存」。寫入後若失敗，會再依 session 是否有效分為 `SESSION_EXPIRED`（「登入狀態已失效，請重新登入後再試」）或 `WRITE_FAILED`（「暫時無法儲存，請稍後再試」）。
- ✅ **完成切換缺錯誤處理（已修復，階段 0A）**：`useTasks.toggleComplete` 改採 try/catch，寫入失敗會把該任務退回切換前狀態，並依失敗原因彈出提示——session 失效顯示「登入狀態已失效，請重新登入後再試」，其他（離線 / 伺服器拒絕）顯示中性的「暫時無法更新，請稍後再試」。Focus / Tasks / TaskDetail 共用同一份 rollback 邏輯（TaskDetail 改為寫入成功後才更新本地狀態）。
- **anon key 硬編碼於原始碼**：雖為 publishable key，仍應確認 Supabase RLS 已正確設定，避免越權讀寫。
- ✅ **無錯誤邊界（已修復，階段 1）**：`App.tsx` 加入 `ErrorBoundary` 包住最外層；頁面 render 例外時顯示「畫面好像出了點問題，請重新整理試試」與重新整理按鈕，不再整片白畫面。
- ✅ **每日指標今日輸入寫入失敗（已修復，階段 5-A 後）**：`useDailyMetrics.saveValue` 的 upsert `onConflict` 原寫成 `(metric_id, date)`，與 Supabase 實際唯一鍵 `(user_id, metric_id, date)` 不符，導致 Postgres `42P10`（找不到對應唯一約束）、寫入失敗但症狀只顯示「暫時無法儲存」。已修正 `onConflict` 為 `(user_id, metric_id, date)`。
  - **經驗教訓**：Supabase 上 `daily_*` logs 表的唯一鍵**包含 `user_id`**（與桌面本機 SQLite 的唯一鍵不同）。未來實作 `daily_rhythm_logs` 寫入時，`onConflict` 應預期為 `(user_id, item_id, date)`，動工前先用 `pg_indexes` 查詢確認實際欄位再寫。

## 待處理項目
- ✅ 下拉刷新已完成（階段 4，Focus / Tasks）；Supabase realtime 即時訂閱仍待評估（保留為後續項目）。
- 換日時間（`dailyResetHour`）目前寫死為 `4`，未來需與桌面版透過 Supabase 同步（桌面版設定存於本機 `settings.json`，尚未上雲）。
- 每日節律（Daily Rhythm）今日打點（階段 5-B，與每日指標同在「今日狀態」頁）。
- 規劃重複任務的實際生成邏輯，而非僅顯示標記。
- 登入畫面評估補上註冊 / 忘記密碼入口。
