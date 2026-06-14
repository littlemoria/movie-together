-- ============================================
-- CineMemo Supabase RLS 配置脚本
-- ============================================
-- 
-- 使用说明：
-- 1. 登录 Supabase 控制台：https://supabase.com/dashboard
-- 2. 选择你的项目
-- 3. 进入 SQL Editor
-- 4. 运行此脚本
--
-- RLS (Row Level Security) 作用：
-- - 限制谁可以读取/写入数据
-- - 即使有人拿到 API Key，也需要通过认证才能访问数据
-- - 保护你的观影记录不被未授权访问
-- ============================================

-- 启用 RLS
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 电影表 (movies) 的访问策略
-- ============================================

-- 策略 1: 允许所有人读取电影数据
-- （如果想要私有，可以改成基于认证用户的策略）
CREATE POLICY "允许公开读取电影"
ON movies
FOR SELECT
TO anon, authenticated
USING (true);

-- 策略 2: 允许所有人添加电影
-- （建议改为仅认证用户可添加）
CREATE POLICY "允许公开添加电影"
ON movies
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 策略 3: 允许更新电影（仅限记录创建者或管理员）
CREATE POLICY "允许更新电影"
ON movies
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 策略 4: 允许删除电影（允许公开删除）
CREATE POLICY "允许公开删除电影"
ON movies
FOR DELETE
TO anon, authenticated
USING (true);

-- ============================================
-- 设置表 (settings) 的访问策略
-- ============================================

-- 策略 1: 允许所有人读取设置
CREATE POLICY "允许公开读取设置"
ON settings
FOR SELECT
TO anon, authenticated
USING (true);

-- 策略 2: 仅允许认证用户修改设置
CREATE POLICY "允许认证用户修改设置"
ON settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- 验证 RLS 是否启用
-- ============================================
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename IN ('movies', 'settings');

-- ============================================
-- 查看所有策略
-- ============================================
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename IN ('movies', 'settings');

-- ============================================
-- 测试 RLS（可在 Supabase SQL Editor 执行）
-- ============================================

-- 测试读取权限
-- SELECT * FROM movies LIMIT 5;

-- 测试写入权限
-- INSERT INTO movies (movie_name, watch_date) 
-- VALUES ('测试电影', '2024-01-01');

-- ============================================
-- 注意事项
-- ============================================
-- 
-- 1. 如果你启用了认证系统，可以进一步限制：
--    - 只允许创建者修改自己的记录
--    - 基于用户角色设置不同权限
--
-- 2. 如果想要完全私有（只有登录用户可见）：
--    - 将 movies 的 SELECT 策略改为：
--      CREATE POLICY "仅认证用户可读取电影"
--      ON movies
--      FOR SELECT
--      TO authenticated
--      USING (true);
--
-- 3. 建议结合 Supabase Auth 使用：
--    - 创建认证用户
--    - 将用户 ID 存储在 movies 表中
--    - 设置基于用户的访问策略
--
-- ============================================
