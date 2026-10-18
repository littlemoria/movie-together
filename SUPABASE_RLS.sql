-- ============================================
-- CineMemo Supabase RLS 收紧脚本
-- ============================================
--
-- 使用说明：
-- 1. 登录 Supabase 控制台：https://supabase.com/dashboard
-- 2. 选择项目 → 进入 SQL Editor
-- 3. 粘贴并运行本脚本
--
-- 设计目标：
-- - 读取：对匿名用户保持公开只读（有链接即可浏览）
-- - 写入（增/改/删）：仅允许已登录用户（authenticated），由 Supabase Auth 提供登录态
-- - 前端不再保存任何密码，anon key 即使公开也无法写入数据
--
-- ⚠️ 运行前请确认已完成：
--    Authentication → Providers → 启用 Email；并创建至少一个用户账号
-- ============================================

-- ============================================
-- 电影表 (movies)
-- ============================================
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;

-- 1) 删除旧的宽松策略（关键：不删则 anon 仍可增删改）
DROP POLICY IF EXISTS "允许公开读取电影" ON movies;
DROP POLICY IF EXISTS "允许公开添加电影" ON movies;
DROP POLICY IF EXISTS "允许更新电影" ON movies;
DROP POLICY IF EXISTS "允许公开删除电影" ON movies;
-- 兼容重复运行
DROP POLICY IF EXISTS "公开读取电影" ON movies;
DROP POLICY IF EXISTS "登录用户添加电影" ON movies;
DROP POLICY IF EXISTS "登录用户更新电影" ON movies;
DROP POLICY IF EXISTS "登录用户删除电影" ON movies;

-- 2) 新策略：公开只读，写入仅限登录用户
CREATE POLICY "公开读取电影"
ON movies
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "登录用户添加电影"
ON movies
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "登录用户更新电影"
ON movies
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "登录用户删除电影"
ON movies
FOR DELETE
TO authenticated
USING (true);

-- ============================================
-- 设置表 (settings)
-- ============================================
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "允许公开读取设置" ON settings;
DROP POLICY IF EXISTS "允许认证用户修改设置" ON settings;
DROP POLICY IF EXISTS "公开读取设置" ON settings;
DROP POLICY IF EXISTS "登录用户写入设置" ON settings;

CREATE POLICY "公开读取设置"
ON settings
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "登录用户写入设置"
ON settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- 验证：查看最终策略
-- ============================================
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('movies', 'settings')
ORDER BY tablename, cmd;

-- ============================================
-- 注意事项
-- ============================================
--
-- 1. SQL Editor 以特权角色运行、会绕过 RLS，"Run 成功"不代表策略正确。
--    真正的验证要在外部用 anon key 发请求：
--      - 未登录 POST/DELETE /rest/v1/movies 应返回 401/403
--      - 未登录 GET /rest/v1/movies 应返回 200
--
-- 2. 若 movies 写入报 "permission denied"（而非 401），可补授权：
--      GRANT SELECT, INSERT, UPDATE, DELETE ON movies TO anon, authenticated;
--      GRANT SELECT, INSERT, UPDATE, DELETE ON settings TO anon, authenticated;
--
-- 3. 若运行到 settings 段报 "relation \"settings\" does not exist"，
--    说明该表尚未创建，跳过 settings 相关语句即可。
--
-- 4. 如日后想让"读取也需登录"（完全私有），把 movies / settings 的
--    SELECT 策略里的 "TO anon, authenticated" 改为 "TO authenticated"。
-- ============================================
