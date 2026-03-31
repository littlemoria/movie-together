# Movie Together - 第X次一起看

## 项目概述
- 记录情侣/朋友一起看电影的成就系统
- 支持两人任意一方录入数据，自动同步

## 页面结构

### 1. 首页 (/)
- 大标题："第 X 次一起看"
- 最近观影记录（最近3条）
- 快速添加按钮

### 2. 影单 (/movies)
- 所有电影的列表
- 支持搜索、筛选
- 显示：电影名、日期、时长、类型

### 3. 成就 (/achievements)
- 徽章卡片展示
- 已解锁 / 未解锁状态
- 进度条

### 4. 统计 (/stats)
- 累计次数、累计时长
- 类型分布（饼图/条形图）
- 月度观看统计

## 数据模型

```javascript
// 电影记录
{
  id: uuid,
  movie_name: string,
  watch_date: date,
  duration_minutes: number,
  genre: string,  // 类型: action, romance, comedy, thriller, sci-fi, drama, horror, animation, documentary
  created_at: timestamp,
  created_by: string  // 记录人昵称
}
```

## 成就系统

| 成就ID | 名称 | 条件 |
|--------|------|------|
| first_watch | 初遇 | 第1次一起看 |
| tenth_watch | 十次之约 | 第10次一起看 |
| twenty_five | 银婚纪念 | 第25次一起看 |
| fifty | 半百之旅 | 第50次一起看 |
| hundred | 百次辉煌 | 第100次一起看 |
| ten_hours | 十小时陪伴 | 累计10小时 |
| fifty_hours | 五十小时 | 累计50小时 |
| hundred_hours | 百小时里程碑 | 累计100小时 |
| romance_lover | 爱情片达人 | 看过10部爱情片 |
| action_hero | 动作片英雄 | 看过10部动作片 |
| night_owl | 夜猫子 | 看过10部午夜场 |

## UI 设计

### 配色
- 背景：#F8F9FA (浅灰白)
- 主色：#2D3436 (深灰)
- 强调色：#6C5CE7 (紫色)
- 成功色：#00B894 (绿色)
- 文字：#2D3436

### 字体
- 标题：思源黑体 / Noto Sans SC
- 正文：系统默认

### 布局
- 底部导航栏（手机友好）
- 卡片式内容展示
- 圆角 12px
- 阴影：0 4px 12px rgba(0,0,0,0.08)

## Supabase 配置

需要创建表：
```sql
create table movies (
  id uuid default gen_random_uuid() primary key,
  movie_name text not null,
  watch_date date not null,
  duration_minutes integer,
  genre text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  created_by text default 'TA'
);
```

## 部署
- GitHub Pages
- Supabase 免费层

## 优化需求

### 1. 数据导入功能
- 支持导入CSV格式的观影记录
- 可选择覆盖或追加模式

### 2. 可爱页面元素
- 鼠标指针换成可爱的猫猫头图标
- 增加页面趣味性

### 3. 视频背景功能验证
- 已实现GIF/MP4视频背景支持
- 需验证实际使用效果

### 4. 月度观看板块增强
- 统计页的月度观看图表可增强
- 可考虑添加具体日期标注或交互

### 5. 页面标题优化
- 目前是"第 X 次一起看"，太直白
- 建议改为更浪漫的表达，如"我们的光影记忆"、"专属观影时光"等

### 6. 自定义域名
- 目前URL包含github用户名 littlemoria
- 可考虑使用自定义域名让URL更优雅

### 7. 修改管理员密码
- 当前密码: movie2024
- 可修改为更个性化的密码

### 8. GitHub仓库安全和隐私
- 项目目前公开，考虑设为私有
- 优化安全设置，保护数据隐私

### 9. 豆瓣自动补全电影信息
- 输入电影名后，自动从豆瓣获取信息
- 如电影时长、海报、类型等
- 减少手动输入

### 10. 背景音乐默认播放
- 进入页面后背景音乐默认自动播放，不静音
- 但音量仅设置为17%

### 11. 新增音乐曲目
- 添加音乐：http://music.163.com/song/media/outer/url?id=1348498231.mp3
- 扩充曲库
