/**
 * 认证错误映射：把 Supabase GoTrue 的英文错误码翻译成可操作的中文提示。
 *
 * 网页版与小程序共用同一套 Supabase 实例，因此错误语义一致，
 * 这里提供同一份映射供两端使用（小程序不支持跨目录 require，故为两份副本）。
 *
 * 关键背景：
 * - `invalid_credentials` 同时覆盖「账号不存在」和「密码错误」两种情况，
 *   GoTrue 出于防枚举考虑不区分，因此无法据此判断账号是否存在。
 * - `email_address_invalid` 表示邮箱域名不在 Supabase 的可投递域名白名单内，
 *   此时连「忘记密码」邮件也发不出去，只能由管理员在控制台重置。
 */

/**
 * 根据错误对象生成中文提示。
 * @param {object|string} error Supabase 错误对象或错误码字符串
 * @returns {string}
 */
function describeAuthError(error) {
    if (!error) return '登录失败，请稍后重试';

    const code = typeof error === 'string' ? error : (error.error_code || error.code || '');
    const raw = typeof error === 'string' ? '' : (error.msg || error.message || '');

    switch (code) {
        case 'invalid_credentials':
            return '邮箱或密码不正确';
        case 'email_not_confirmed':
            return '邮箱尚未验证，请联系管理员在 Supabase 控制台确认该邮箱';
        case 'email_address_invalid':
            return '该邮箱域名无法被 Supabase 接受（需在控制台重置密码）';
        case 'user_not_found':
            return '账号不存在，请检查邮箱是否输入正确';
        case 'signup_disabled':
            return '该实例已关闭注册，请使用已有账号登录';
        case 'weak_password':
            return '密码强度不足，请至少 8 位并包含大小写字母与数字';
        case 'over_request_rate_limit':
        case 'over_email_send_rate_limit':
            return '请求过于频繁，请稍后再试';
        case 'email_exists':
            return '该邮箱已注册';
        default:
            break;
    }

    // 部分情况下只有 msg 没有 error_code，按关键字兜底匹配
    const text = String(raw);
    if (/invalid login credentials/i.test(text)) return '邮箱或密码不正确';
    if (/email not confirmed/i.test(text)) return '邮箱尚未验证，请联系管理员确认';
    if (/signups not allowed/i.test(text)) return '该实例已关闭注册，请使用已有账号登录';
    if (/email address .* is invalid/i.test(text)) return '该邮箱域名无法被 Supabase 接受（需在控制台重置密码）';

    return raw ? `登录失败：${raw}` : '登录失败，请稍后重试';
}

module.exports = { describeAuthError };
