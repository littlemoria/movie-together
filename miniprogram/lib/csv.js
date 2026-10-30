/**
 * CSV 导入导出：迁移自网页版 js/app.js 的 parseCSV / parseCSVLine / 导出逻辑。
 */
const CSV_HEADER = ['电影名称', '观影日期', '时长(分钟)', '类型', '记录人'];

/**
 * 解析单行 CSV（处理引号与转义）。
 */
function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    return values;
}

/**
 * 解析 CSV 文本为记录数组（首行为表头）。
 */
function parseCSV(text) {
    let content = String(text || '');
    // 去除 UTF-8 BOM
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

    const lines = content.split('\n').filter((line) => line.trim());
    if (lines.length < 2) return [];

    const movies = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length >= 2 && values[0]) {
            movies.push({
                movie_name: values[0],
                watch_date: values[1],
                duration_minutes: values[2] ? parseInt(values[2], 10) : null,
                genre: values[3] || '',
                created_by: values[4] || 'TA',
            });
        }
    }
    return movies;
}

function escapeCSVValue(value) {
    const text = value === null || value === undefined ? '' : String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

/**
 * 生成 CSV 文本。
 */
function toCSV(movies) {
    const rows = [CSV_HEADER.join(',')];
    (Array.isArray(movies) ? movies : []).forEach((movie) => {
        rows.push([
            escapeCSVValue(movie.movie_name),
            escapeCSVValue(movie.watch_date),
            escapeCSVValue(movie.duration_minutes),
            escapeCSVValue(movie.genre),
            escapeCSVValue(movie.created_by),
        ].join(','));
    });
    return rows.join('\n');
}

module.exports = { parseCSV, parseCSVLine, toCSV, CSV_HEADER };
