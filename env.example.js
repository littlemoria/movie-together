/**
 * 环境配置示例
 * 
 * 使用说明：
 * 1. 复制此文件并重命名为 env.js
 * 2. 填入你的真实配置信息
 * 3. 将 env.js 添加到 .gitignore（如果还没有）
 * 
 * 注意：不要将 env.js 提交到 GitHub！
 */

// Supabase 配置
const ENV = {
  // Supabase 项目配置
  SUPABASE_URL: 'YOUR_SUPABASE_URL',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',
  
  // TMDB API Key（从 https://www.themoviedb.org/settings/api 获取）
  TMDB_API_KEY: 'YOUR_TMDB_API_KEY',
  
  // 管理员密码（建议修改默认密码）
  ADMIN_PASSWORD: 'change-this-password',
  
  // 是否启用调试模式
  DEBUG: false
};

// 导出配置
if (typeof window !== 'undefined') {
  window.ENV = ENV;
}
