/**
 * 认证错误映射测试：确保 Supabase 英文错误码能翻译成可操作的中文提示。
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const MINI_LIB = path.join(__dirname, '..', 'miniprogram', 'lib');
const { describeAuthError } = require(path.join(MINI_LIB, 'auth-errors.js'));

test('invalid_credentials 提示邮箱或密码不正确', () => {
    assert.strictEqual(
        describeAuthError({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
        '邮箱或密码不正确'
    );
});

test('email_not_confirmed 引导去控制台确认邮箱', () => {
    const msg = describeAuthError({ error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
    assert.ok(msg.includes('邮箱尚未验证'), msg);
    assert.ok(msg.includes('控制台'), msg);
});

test('email_address_invalid 提示需在控制台重置密码', () => {
    const msg = describeAuthError({
        error_code: 'email_address_invalid',
        msg: 'Email address "tong@chn.heart" is invalid',
    });
    assert.ok(msg.includes('控制台'), msg);
});

test('signup_disabled 提示使用已有账号登录', () => {
    const msg = describeAuthError({ error_code: 'signup_disabled', msg: 'Signups not allowed for this instance' });
    assert.ok(msg.includes('已有账号'), msg);
});

test('兼容 SDK 的 code 字段（error_code 会被归一为 code）', () => {
    assert.strictEqual(
        describeAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
        '邮箱或密码不正确'
    );
});

test('仅有 msg 无错误码时按关键字兜底匹配', () => {
    assert.strictEqual(
        describeAuthError({ msg: 'Invalid login credentials' }),
        '邮箱或密码不正确'
    );
    assert.strictEqual(
        describeAuthError({ message: 'Email not confirmed' }),
        '邮箱尚未验证，请联系管理员确认'
    );
});

test('未知错误保留原始信息，不吞掉排查线索', () => {
    const msg = describeAuthError({ error_code: 'some_new_code', msg: 'Brand new failure reason' });
    assert.ok(msg.includes('Brand new failure reason'), msg);
});

test('空错误返回兜底提示', () => {
    assert.strictEqual(describeAuthError(null), '登录失败，请稍后重试');
    assert.strictEqual(describeAuthError(undefined), '登录失败，请稍后重试');
    assert.strictEqual(describeAuthError(''), '登录失败，请稍后重试');
});

test('网页版与小程序两份映射副本内容一致', () => {
    const fs = require('node:fs');
    const web = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth-errors.js'), 'utf8');
    const mini = fs.readFileSync(path.join(MINI_LIB, 'auth-errors.js'), 'utf8');
    // 抽取 switch 分支做比对（两端仅导出方式不同）
    const extract = (s) => s.slice(s.indexOf('switch (code)'), s.indexOf('// 部分情况下只有 msg'));
    assert.strictEqual(extract(web), extract(mini), '两端错误映射必须保持一致');
});
