-- ============================================
-- CineMemo Supabase RLS 收紧脚本（共用单账号版）
-- ============================================
--
-- 适用场景：
--   你与女朋友共用一个 Supabase 账号（同一个邮箱 + 密码登录同一个网页），
--   因此不需要为两人分别生成用户 UUID，也不需要成员白名单表。
--
-- 设计目标：
--   - 只有「登录了该账号的人」能读取和写入数据
--   - 匿名访客（anon）看不到任何数据、也改不了任何数据
--   - 配合「关闭公开注册」，世界上不会出现第二个可登录的账号，
--     等价于仅你们两人可用
--
-- 使用说明：
--   1. 登录 Supabase 控制台：https://supabase.com/dashboard
--   2. 选择项目 → 打开 SQL Editor
--   3. 粘贴本脚本全部内容 → 点击 Run
--   4. 再到 Authentication → Sign In / Users → 关闭「Allow new users to sign up」
--      （这一步必须在控制台页面手动点，SQL 无法代劳）
-- ============================================

-- ============================================
-- 电影表 (movies)：仅已登录用户可读写
-- ============================================
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;

-- 删除所有旧策略（含早期“公开可读/公开可写”的宽松策略，避免残留）
DROP POLICY IF EXISTS "允许公开读取电影" ON movies;
DROP POLICY IF EXISTS "允许公开添加电影" ON movies;
DROP POLICY IF EXISTS "允许更新电影" ON movies;
DROP POLICY IF EXISTS "允许公开删除电影" ON movies;
DROP POLICY IF EXISTS "公开读取电影" ON movies;
DROP POLICY IF EXISTS "登录用户添加电影" ON movies;
DROP POLICY IF EXISTS "登录用户更新电影" ON movies;
DROP POLICY IF EXISTS "登录用户删除电影" ON movies;
-- 兼容上一版“成员表”策略（若之前误跑过，一并清理）
DROP POLICY IF EXISTS "成员读取电影" ON movies;
DROP POLICY IF EXISTS "成员添加电影" ON movies;
DROP POLICY IF EXISTS "成员更新电影" ON movies;
DROP POLICY IF EXISTS "成员删除电影" ON movies;

-- 新策略：读取仅限登录用户
CREATE POLICY "登录用户读取电影"
ON movies
FOR SELECT
TO authenticated
USING (true);

-- 新增：仅限登录用户
CREATE POLICY "登录用户添加电影"
ON movies
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 更新：仅限登录用户
CREATE POLICY "登录用户更新电影"
ON movies
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 删除：仅限登录用户
CREATE POLICY "登录用户删除电影"
ON movies
FOR DELETE
TO authenticated
USING (true);

-- ============================================
-- 设置表 (settings)：仅已登录用户可读写
-- ============================================
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "允许公开读取设置" ON settings;
DROP POLICY IF EXISTS "允许认证用户修改设置" ON settings;
DROP POLICY IF EXISTS "公开读取设置" ON settings;
DROP POLICY IF EXISTS "登录用户写入设置" ON settings;
DROP POLICY IF EXISTS "成员读取设置" ON settings;
DROP POLICY IF EXISTS "成员写入设置" ON settings;

CREATE POLICY "登录用户读取设置"
ON settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "登录用户写入设置"
ON settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- 授权：只把业务表操作权限给 authenticated，撤销 anon 的一切权限
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON movies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON settings TO authenticated;

-- 彻底私有：匿名角色不能碰业务表
REVOKE ALL ON movies FROM anon;
REVOKE ALL ON settings FROM anon;

-- ============================================
-- 验证：查看最终策略
-- ============================================
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('movies', 'settings')
ORDER BY tablename, cmd;

-- ============================================
-- 注意事项（务必阅读）
-- ============================================
--
-- 1. SQL Editor 以特权角色运行、会绕过 RLS，「Run 成功」不代表策略已生效。
--    真正验证要在外部用 anon key 发请求：
--      - 未登录 GET  /rest/v1/movies   → 应返回 401 或空集（看不到数据）
--      - 未登录 POST /rest/v1/movies   → 应返回 401/403（写不进去）
--      - 登录后 GET/POST               → 应正常读写
--
-- 2. 最关键的一步在控制台（SQL 无法代劳）：
--      Authentication → Sign In / Users → 关闭「Allow new users to sign up」
--    关闭后，任何人都无法再注册新账号，只有你现有的这个账号能登录。
--    这样即便 RLS 只按「是否登录」放行，也等价于「只有你们两人可用」。
--
-- 3. 若写入报 "permission denied"（而非 401），说明表级权限缺失，
--    确认上方 GRANT 语句已执行。
--
-- 4. 若 settings 表不存在，跳过 settings 相关语句即可（按报错提示处理）。
--
-- 5. 你们共用同一个账号 → 数据库里只会有这一个用户 UUID，无需、也无法
--    为两人分别生成 UUID。若未来想让女朋友拥有独立账号（例如区分“谁记录的”），
--    那时再让她单独注册一个账号，并重新启用成员白名单方案即可。
-- ============================================
