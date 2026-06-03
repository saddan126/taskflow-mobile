# Liana 手機版狀態文件
> 最後更新：2026-06-02

## 技術架構
- **框架**：React 18 + TypeScript，建置工具 Vite 5，路由用 `react-router-dom` v6（`BrowserRouter`）。UI 全部為 inline style，無 CSS 框架。
- **部署**：PWA（`vite-plugin-pwa`，`registerType: 'autoUpdate'`，standalone / portrait）。Manifest 定義在 `vite.config.ts` 而非靜態 `public/manifest.json`；`public/` 只有 `icon-192.png`、`icon-512.png`。專案根目錄 `.vercel` 已被 gitignore，推測以 Vercel 部署。
- **API 連接方式**：前端直接呼叫 Supabase JS client（`@supabase/supabase-js` v2）。Supabase URL 與 anon（publishable）key 硬編碼在 `src/lib/supabase.ts`。資料存取主要透過 `src/hooks/useTasks.ts` 與 `src/hooks/useCategories.ts`，直接對 Supabase 資料表查詢/寫入，無後端 API 層。

## 目前已實作的功能
- **登入**（完整）：Email + 密碼登入（`supabase.auth.signInWithPassword`），有 session 持久化與 `onAuthStateChange` 監聽（`src/App.tsx`）。
- **快速記錄 / Capture**（完整）：輸入任務標題、選分類、選到期日，Enter 快速儲存，成功 toast、錯誤提示。樂觀新增（`useTasks.createTask`）。
- **今日焦點 / Focus**（完整）：依到期日分組顯示「逾期 / 今天到期 / 未來 7 天 / 等待中（被阻擋）」，含到期 badge 與空狀態。
- **全部任務 / Tasks**（大致完整）：依分類篩選（橫向 chip），分「進行中 / 已完成」兩區。
- **任務詳情 / TaskDetail**（唯讀為主）：顯示標題、狀態 badge、detail 備註、分類、到期日、前置任務、子任務。可切換完成。
- **完成切換**（完整）：三個頁面皆可勾選完成，樂觀更新（`completed` 0/1）。
- **任務依賴顯示**（僅顯示）：`useTasks` 計算 `blockedIds`，被前置任務阻擋者顯示 🔒，詳情頁顯示「等待前置任務」與前置清單。
- **分類顯示**（唯讀）：`useCategories` 讀取分類，用於篩選與色點顯示。
- **PWA 安裝**（完整）：可加到主畫面、autoUpdate。

## 尚未實作的功能（對比桌面版）
以下為桌面版已有、手機版尚未實作者：
- **每日節律（Daily Rhythm）**：無，程式碼完全沒有相關頁面或查詢。
- **每日指標（Daily Metrics）**：無。
- **每日軌跡（Daily Track）**：無。
- **收成紀錄（Harvest）**：無。
- **冷藏清單**：無。
- **行事曆**：無（僅有單一任務的 due_date 文字，沒有月曆/週曆視圖）。
- **關係圖**：無（依賴關係只用清單與 🔒 呈現，無圖形化）。
- **批次操作**：無（無多選、無批次完成/刪除/移動）。
- **任務依賴關係**：僅能「顯示」被阻擋狀態與前置清單；**無法新增、編輯或移除依賴**（`task_dependencies` 只讀不寫）。
- **重複任務**：僅在詳情頁顯示 🔁 標記（依 `recurrence_rule` 是否存在）；**無法設定重複規則，也沒有重複任務的自動生成邏輯**。
- **其他（依程式碼判斷）**：
  - **編輯任務**：標題、備註（detail）、分類、到期日建立後皆無法在手機上修改。
  - **刪除任務**：無刪除 UI（schema 有 `deleted_at` 軟刪除，但前端不寫入）。
  - **建立子任務**：詳情頁可看子任務，但無法新增（`createTask` 固定 `parent_id: null`）。
  - **星標 / starred**：schema 與型別都有 `starred` 欄位，但前端完全沒有 UI。
  - **手動排序**：依 `manual_order` 排序顯示，但無拖曳/重排 UI。
  - **分類管理（CRUD）**：分類只讀，無新增/改色/刪除。
  - **搜尋 / 進階篩選**：無。
  - **註冊新帳號 / 忘記密碼**：登入畫面只有登入，無註冊或重設密碼。

## 與桌面版的資料同步
- **共用的 Supabase 資料表**：`tasks`、`categories`、`task_dependencies`。手機與桌面連同一個 Supabase 專案（`svdtwblpjwdkjpvzsvpt`），以 `user_id` 區隔資料。
- **目前同步狀況（手機建立的任務電腦是否看得到）**：可以。寫入的是同一個資料庫的同一張 `tasks` 表、同一個 `user_id`，桌面端重新載入即可看到手機建立的任務，反之亦然。
- **已知同步問題**：
  - **無 realtime 訂閱**：手機端只在元件掛載或切換分類時 `load()`，不會即時收到其他裝置的變更，需重開頁面/重載才會更新。
  - **樂觀更新不重載**：`toggleComplete` 改完不重新抓取，多裝置同時操作可能短暫不一致。
  - **時間戳由前端產生**：`created_at` / `updated_at` 由裝置本地時鐘以 ISO 字串寫入，跨裝置時鐘不同步時排序可能受影響。
  - **`manual_order` 規則不一致**：`useTasks.createTask` 寫入固定值 `9999`，而 `lib/api.ts` 用 `Date.now()`（後者目前未被使用，見下）；若日後啟用會造成排序基準不一致。

## 已知問題與限制
- **`src/lib/api.ts` 為死碼**：全專案沒有任何檔案 import 它，App 實際走 `hooks/useTasks.ts` + `lib/supabase.ts`。`api.ts` 內含與 `useTasks` 重複且行為不同的 `createTask` / `toggleComplete`（例如 `manual_order` 不同），容易誤導維護者。
- **`Tasks.tsx` CSS bug**：第 29 行 `paddingTop:'calc(20px + env(safe-area-inset-top)'` 少一個右括號，`calc()` 未閉合，該 padding 在多數瀏覽器會被視為無效而失效（瀏海安全區 padding 沒生效）。
- **時區邊界**：`daysFromToday` 用 `new Date('YYYY-MM-DD')`（解析為 UTC 午夜）再與本地 `setHours(0,0,0,0)` 相減，跨時區時可能「逾期/今天」差一天。`todayStr` 用 `toISOString().slice(0,10)` 取的是 UTC 日期，與本地日期在跨日時段可能不一致。
- **寫入皆需連線、無離線佇列**：雖是 PWA，但建立/完成任務都直接打 Supabase，離線時 Capture 會顯示「儲存失敗」，完成切換則靜默失敗。
- **完成切換缺錯誤處理**：Focus / Tasks / TaskDetail 的 `toggleComplete` 沒有 try/catch 或 rollback，後端失敗時 UI 仍顯示已完成（與真實狀態不符）。
- **anon key 硬編碼於原始碼**：雖為 publishable key，仍應確認 Supabase RLS 已正確設定，避免越權讀寫。
- **無錯誤邊界**：任何頁面 render 例外會讓整個 App 白畫面。

## 待處理項目
- 修正 `Tasks.tsx` 第 29 行 `calc(...)` 缺右括號的 CSS bug。
- 移除或整併死碼 `src/lib/api.ts`，避免與 `useTasks` 邏輯分歧（特別是 `manual_order`）。
- 為 `toggleComplete` 加入錯誤處理與失敗 rollback。
- 補上任務編輯（標題 / 備註 / 分類 / 到期日）與刪除（軟刪除）功能。
- 評估導入 Supabase realtime 或下拉刷新，改善多裝置同步即時性。
- 統一時間/時區處理（`todayStr`、`daysFromToday`），避免跨日誤判。
- 規劃重複任務的實際生成邏輯，而非僅顯示標記。
- 登入畫面評估補上註冊 / 忘記密碼入口。
