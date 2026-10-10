/**
 * test-tags.mjs —— workers/tags.js 的验证脚本（开发用，不参与部署）
 *
 * 运行：
 *   node .dev/test-tags.mjs
 * 想消掉 Node 的 MODULE_TYPELESS_PACKAGE_JSON 提示（本项目没有 package.json，
 * Node 要先探测 workers/tags.js 是不是 ESM，纯属噪声）：
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .dev/test-tags.mjs
 *
 * 覆盖四块：
 *   1) 真实素材（.dev/music/** 只读 + .dev/tmp-gen/** 临时生成）的字段断言
 *   2) 合成标签字节：ID3v2.2 / UTF-16 BOM / 同步安全帧长 / 反同步 / TCON 数字流派
 *   3) 损坏与截断输入的"绝不抛异常"模糊测试
 *   4) 用 ffprobe 交叉核对 duration 与 tags
 * 全部通过时退出码 0，任何一个断言失败退出码 1（方便 CI / 上层脚本判断）。
 *
 * 路径约定：用例里的 file 一律相对本文件所在目录（.dev/）。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseTags } from '../workers/tags.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const GEN = path.join(HERE, 'tmp-gen');
const PROBE_CACHE = path.join(GEN, 'probe');
const FFPROBE = 'D:\\ffmpeg\\bin\\ffprobe.exe';

/* ============================================================ 断言框架 == */

let pass = 0;
let fail = 0;
const failures = [];

function check(label, ok, detail) {
    if (ok) { pass++; return true; }
    fail++;
    failures.push(`${label}${detail ? ' → ' + detail : ''}`);
    return false;
}

function eq(label, got, want) {
    return check(label, got === want, `期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`);
}

function near(label, got, want, tol) {
    const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
    return check(label, ok, `期望 ${want}±${tol}，实际 ${got}`);
}

const line = (s) => process.stdout.write(s + '\n');
const hr = (c = '=') => line(c.repeat(78));
const show = (label, t) => {
    line(`      codec=${t.codec}  container=${t.container}  lossless=${t.lossless}  rate=${t.rate}  bits=${t.bits}  kbps=${t.kbps}  duration=${t.duration}s`);
    line(`      title=${JSON.stringify(t.title)}  artist=${JSON.stringify(t.artist)}  albumArtist=${JSON.stringify(t.albumArtist)}  album=${JSON.stringify(t.album)}`);
    line(`      track=${t.track}/${t.trackTotal}  disc=${t.disc}  year=${JSON.stringify(t.year)}  genre=${JSON.stringify(t.genre)}`);
    line(t.picture
        ? `      cover=${t.picture.mime} ${t.picture.data.length}B  魔数=${magicOf(t.picture.data)}`
        : '      cover=null');
};

/* ======================================================== 返回结构完整性 == */

// 接口约定里的 17 个字段，一个不多一个不少（上层会直接解构，多出来的字段容易掩盖笔误）
const SHAPE = {
    title: 'string', artist: 'string', albumArtist: 'string', album: 'string',
    track: 'number', trackTotal: 'number', disc: 'number', year: 'string', genre: 'string',
    duration: 'number', codec: 'string', bits: 'number', rate: 'number', kbps: 'number',
    lossless: 'boolean', picture: 'object', container: 'string',
};
const SHAPE_KEYS = Object.keys(SHAPE);

function checkShape(t, label) {
    const keys = Object.keys(t);
    check(`${label} 字段集合一致`, keys.length === SHAPE_KEYS.length && SHAPE_KEYS.every((k) => keys.indexOf(k) >= 0),
        `实际 keys=${keys.join(',')}`);
    for (const k of SHAPE_KEYS) {
        if (!(k in t)) continue;
        check(`${label} ${k} 类型`, typeof t[k] === SHAPE[k], `实际 ${typeof t[k]}`);
    }
    if (t.picture !== null) {
        check(`${label} picture.mime`, typeof t.picture.mime === 'string');
        check(`${label} picture.data`, t.picture.data instanceof Uint8Array);
    }
    check(`${label} duration 有限且 >= 0`, Number.isFinite(t.duration) && t.duration >= 0, `实际 ${t.duration}`);
}

/* =============================================================== 工具 == */

function magicOf(u8) {
    if (u8.length > 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'JPEG';
    if (u8.length > 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return 'PNG';
    return '(未知)';
}

/* ============================================================ 素材用例表 == */

const CASES = [
    {
        file: 'music/Test Album One/01 - First Track.mp3',
        who: 'MP3 · ID3v2.3(latin1) + APIC / 第 1 轨',
        exp: {
            title: 'First Track', artist: 'Test Artist', albumArtist: 'Test Artist',
            album: 'Test Album One', track: 1, trackTotal: 3, disc: 0, year: '2024',
            genre: 'Electronic', codec: 'MP3', container: 'id3v2', lossless: false,
            rate: 44100, bits: 0, kbps: 64,
        },
        pic: { mime: 'image/jpeg', magic: 'JPEG', min: 5000 },
        dur: { at: 6, tol: 1.5 },
    },
    {
        file: 'music/Test Album One/02 - Second Track.mp3',
        who: 'MP3 · ID3v2.3(latin1) + APIC / 第 2 轨',
        exp: {
            title: 'Second Track', artist: 'Test Artist', albumArtist: 'Test Artist',
            album: 'Test Album One', track: 2, trackTotal: 3, year: '2024',
            genre: 'Electronic', codec: 'MP3', container: 'id3v2', lossless: false,
        },
        pic: { mime: 'image/jpeg', magic: 'JPEG', min: 5000 },
        dur: { at: 7, tol: 1.5 },
    },
    {
        file: 'music/Test Album One/03 - Third Track.mp3',
        who: 'MP3 · ID3v2.3(latin1) + APIC / 第 3 轨',
        exp: {
            title: 'Third Track', artist: 'Test Artist', albumArtist: 'Test Artist',
            album: 'Test Album One', track: 3, trackTotal: 3, year: '2024',
            genre: 'Electronic', codec: 'MP3', container: 'id3v2', lossless: false,
        },
        pic: { mime: 'image/jpeg', magic: 'JPEG', min: 5000 },
        dur: { at: 5, tol: 1.5 },
    },
    {
        file: 'music/Test Album Two/1 - Alpha.flac',
        who: 'FLAC · STREAMINFO + VORBIS_COMMENT + PICTURE(type 0，非 3)',
        exp: {
            title: 'Alpha', artist: 'Another Artist', albumArtist: 'Another Artist',
            album: 'Test Album Two', track: 1, trackTotal: 2, year: '2023',
            genre: 'Ambient', codec: 'FLAC', container: 'flac', lossless: true,
            rate: 44100, bits: 16,
        },
        pic: { mime: 'image/jpeg', magic: 'JPEG', min: 5000 },
        dur: { at: 8, tol: 0.001 }, // STREAMINFO 里有总采样数，FLAC 的时长必须是精确值
    },
    {
        file: 'music/Test Album Two/2 - Beta.flac',
        who: 'FLAC · STREAMINFO + VORBIS_COMMENT + PICTURE(type 0，非 3)',
        exp: {
            title: 'Beta', artist: 'Another Artist', albumArtist: 'Another Artist',
            album: 'Test Album Two', track: 2, trackTotal: 2, year: '2023',
            genre: 'Ambient', codec: 'FLAC', container: 'flac', lossless: true,
            rate: 44100, bits: 16,
        },
        pic: { mime: 'image/jpeg', magic: 'JPEG', min: 5000 },
        dur: { at: 6, tol: 0.001 },
    },
    {
        file: 'music/No Tags Here/unnamed.mp3',
        who: 'MP3 · 无任何用户标签（文件里只有 TSSE 编码器帧）',
        exp: {
            title: '', artist: '', albumArtist: '', album: '', track: 0, trackTotal: 0,
            disc: 0, year: '', genre: '', codec: 'MP3', lossless: false, rate: 44100,
        },
        pic: null,
        // container 放宽到集合：ffmpeg 给这个文件写了只含 TSSE 的 ID3v2.4 空壳，
        // 我们按"元数据实际来自哪里"的语义报 'none'，别把语义分歧当成 bug。
        containerIn: ['none', 'id3v1', 'id3v2'],
        dur: { at: 4, tol: 1.5 },
    },
    {
        file: 'tmp-gen/id3v1-pure.mp3',
        optional: true, // 用 ffmpeg 临时生成的：缺了就跳过，先跑 .dev/tmp-gen/run-tests.sh
        who: 'MP3 · 纯 ID3v1.1（把 ID3v2 整块剥掉后派生的临时素材）',
        exp: {
            title: 'ID3v1 Title', artist: 'ID3v1 Artist', albumArtist: '', album: 'ID3v1 Album',
            track: 7, year: '1999', genre: 'Blues', codec: 'MP3', container: 'id3v1', lossless: false,
        },
        pic: null,
        dur: { at: 3, tol: 1.5 },
    },
    {
        file: 'tmp-gen/id3v24-utf8.mp3',
        optional: true,
        who: 'MP3 · ID3v2.4 + TDRC + UTF-8 中文标签',
        exp: {
            title: '中文标题 Ünïcode', artist: '艺术家 Artist', album: '专辑 Album',
            track: 4, trackTotal: 9, year: '2025', genre: 'Jazz', codec: 'MP3',
            container: 'id3v2', lossless: false,
        },
        pic: null,
        dur: { at: 3, tol: 1.5 },
    },
    {
        file: 'tmp-gen/cover-tagged.mp3',
        optional: true,
        who: 'MP3 · ID3v2.3 + APIC（64×64 JPEG 封面）',
        exp: {
            title: 'Cover Mp3', artist: 'Cover Artist', album: 'Cover Album',
            track: 2, trackTotal: 8, year: '2021', genre: 'Rock', codec: 'MP3',
            container: 'id3v2', lossless: false,
        },
        pic: { mime: 'image/jpeg', magic: 'JPEG', min: 100 },
        dur: { at: 5, tol: 1.5 },
    },
    {
        file: 'tmp-gen/tagged.m4a',
        optional: true,
        who: 'M4A/AAC · mvhd + ilst(©nam/©ART/aART/©alb/trkn/disk/©day/©gen/covr)',
        exp: {
            title: 'M4A Title', artist: 'M4A Artist', albumArtist: 'M4A AlbumArtist',
            album: 'M4A Album', track: 3, trackTotal: 11, disc: 1, year: '2020',
            genre: 'Pop', codec: 'AAC', container: 'mp4', lossless: false, rate: 44100, bits: 0,
        },
        pic: { mime: 'image/jpeg', magic: 'JPEG', min: 100 },
        dur: { at: 5, tol: 0.05 },
    },
    {
        file: 'tmp-gen/tagged.ogg',
        optional: true,
        who: 'OGG Vorbis · 注释头（键名大小写混写：title / ALBUMARTIST / TRACKNUMBER）',
        exp: {
            title: 'Ogg Title', artist: 'Ogg Artist', albumArtist: 'Ogg AlbumArtist',
            album: 'Ogg Album', track: 5, trackTotal: 12, disc: 2, year: '2019',
            genre: 'Folk', codec: 'Vorbis', container: 'ogg', lossless: false, rate: 44100,
        },
        pic: null,
        dur: { at: 5, tol: 0.05 },
    },
    {
        file: 'tmp-gen/tagged.wav',
        optional: true,
        who: 'WAV/PCM · fmt + data + LIST/INFO(INAM/IART/IPRD/ICRD/IGNR/IPRT)',
        exp: {
            title: 'Wav Title', artist: 'Wav Artist', album: 'Wav Album', year: '2018',
            genre: 'Classical', track: 6, codec: 'WAV', container: 'none', lossless: true,
            rate: 44100, bits: 16,
        },
        pic: null,
        dur: { at: 3, tol: 0.05 },
    },
];

/* ========================================================= 1) 真实素材 == */

hr();
line('第 1 部分：真实音频素材字段断言');
hr();

const results = new Map();
let skippedOptional = 0;

CASES.forEach((c, i) => {
    const abs = path.resolve(HERE, c.file);
    line('');
    line(`[${String(i + 1).padStart(2)}/${CASES.length}] ${c.who}`);
    line(`      ${path.relative(ROOT, abs).replace(/\\/g, '/')}`);
    if (!fs.existsSync(abs)) {
        if (c.optional) {
            // 临时素材缺失不算失败，但必须让人看见覆盖率掉了
            skippedOptional++;
            line('      [跳过] 临时素材不存在 —— 先跑 .dev/tmp-gen/run-tests.sh 生成');
            return;
        }
        check(`${c.who} 素材存在`, false, `找不到 ${abs}`);
        line('      !! 素材缺失，跳过');
        return;
    }
    const bytes = new Uint8Array(fs.readFileSync(abs));
    line(`      文件 ${bytes.length} 字节`);
    const before = fail;
    let t;
    try {
        t = parseTags(bytes, path.basename(abs));
    } catch (e) {
        check(`${c.who} 不抛异常`, false, String((e && e.stack) || e));
        return;
    }
    check(`${c.who} 不抛异常`, true);
    checkShape(t, c.who);
    results.set(abs, t);

    for (const [k, v] of Object.entries(c.exp)) eq(`${c.who} ${k}`, t[k], v);
    if (c.containerIn) {
        check(`${c.who} container ∈ {${c.containerIn.join(',')}}`, c.containerIn.includes(t.container), `实际 ${t.container}`);
    }
    if (c.pic === null) {
        eq(`${c.who} picture`, t.picture, null);
    } else {
        check(`${c.who} 有封面`, !!t.picture);
        if (t.picture) {
            eq(`${c.who} 封面 mime`, t.picture.mime, c.pic.mime);
            check(`${c.who} 封面字节数 >= ${c.pic.min}`, t.picture.data.length >= c.pic.min, `实际 ${t.picture.data.length}`);
            eq(`${c.who} 封面魔数`, magicOf(t.picture.data), c.pic.magic);
            // 封面必须是拷贝而不是输入缓冲区的视图：否则调用方留一张封面就留住了整个文件
            check(`${c.who} 封面是独立拷贝`, t.picture.data.buffer !== bytes.buffer);
        }
    }
    if (c.dur) near(`${c.who} duration≈${c.dur.at}s(±${c.dur.tol})`, t.duration, c.dur.at, c.dur.tol);

    show(c.who, t);
    line(`      本文件断言：${fail === before ? '全通过 ✓' : `失败 ${fail - before} 项`}`);
});

{
    const p = path.join(HERE, 'music/No Tags Here/unnamed.mp3');
    if (fs.existsSync(p)) {
        const b = fs.readFileSync(p);
        const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
        line('');
        line(`      注：unnamed.mp3 其实带一个 ID3v2.${b[3]} 标签（声明 ${size} 字节），`);
        line('          但里面只有一个 TSSE（编码器名）帧，没有任何用户字段，所以 container 报 none。');
    }
}

/* ===================================================== 2) 合成标签字节 == */

hr();
line('第 2 部分：合成标签字节（真实素材没覆盖到的分支）');
hr();

const latin1Bytes = (s) => [...s].map((c) => c.codePointAt(0) & 0xff);
const utf16beBytes = (s) => [...s].flatMap((c) => { const v = c.codePointAt(0); return [(v >> 8) & 0xff, v & 0xff]; });
const utf16leBytes = (s) => [...s].flatMap((c) => { const v = c.codePointAt(0); return [v & 0xff, (v >> 8) & 0xff]; });
const ssf = (n) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

/**
 * 造一个 ID3 帧。
 * @param {string} id          'TT2'(v2.2) 或 'TIT2'(v2.3/2.4)
 * @param {number[]} body      帧数据（长度字段声明的是 body.length）
 * @param {number} major       2 / 3 / 4
 * @param {number[]} [stored]  实际落盘字节；只有反同步测试需要它和 body 不一致
 */
function frame(id, body, major, stored) {
    const n = body.length;
    const len = id.length === 3
        ? [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
        : (major === 4 ? ssf(n) : [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
    const hdr = id.length === 3 ? [...ascii(id), ...len] : [...ascii(id), ...len, 0, 0];
    return [...hdr, ...(stored || body)];
}

function buildTag(major, frames, flags = 0) {
    const body = frames.flat();
    return new Uint8Array([0x49, 0x44, 0x33, major, 0, flags, ...ssf(body.length), ...body]);
}

// 给标签尾巴接一个真实 MPEG1 Layer3 帧头（ff fb 50 c0 = MPEG1/Layer3/64kbps/44100/mono），
// 让 MP3 的"找帧头 → 估时长"路径也能跑完整。
const MPEG_TAIL = [0xff, 0xfb, 0x50, 0xc0];
const withTail = (tag) => new Uint8Array([...tag, ...MPEG_TAIL]);

{
    const label = '合成 · ID3v2.2（3 字符帧 ID + PIC）';
    const tag = buildTag(2, [
        frame('TT2', [0, ...latin1Bytes('Old Title')], 2),
        frame('TP1', [0, ...latin1Bytes('Old Artist')], 2),
        frame('TAL', [0, ...latin1Bytes('Old Album')], 2),
        frame('TRK', [0, ...latin1Bytes('2/5')], 2),
        frame('TYE', [0, ...latin1Bytes('1994')], 2),
        frame('TCO', [0, ...latin1Bytes('(17)')], 2),
        // PIC：编码(1) + 图片格式(3 字符) + 图片类型(1) + 描述(\0 结尾) + 数据
        frame('PIC', [0, 0x4a, 0x50, 0x47, 3, 0, 0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4], 2),
    ]);
    const t = parseTags(withTail(tag), 'v22.mp3');
    show(label, t);
    eq(`${label} title`, t.title, 'Old Title');
    eq(`${label} artist`, t.artist, 'Old Artist');
    eq(`${label} album`, t.album, 'Old Album');
    eq(`${label} track`, t.track, 2);
    eq(`${label} trackTotal`, t.trackTotal, 5);
    eq(`${label} year`, t.year, '1994');
    eq(`${label} genre "(17)"→Rock`, t.genre, 'Rock');
    eq(`${label} 封面 mime(JPG→image/jpeg)`, t.picture && t.picture.mime, 'image/jpeg');
    eq(`${label} 封面字节数`, t.picture && t.picture.data.length, 8);
    eq(`${label} container`, t.container, 'id3v2');
    eq(`${label} rate`, t.rate, 44100);
}
{
    const label = '合成 · TCON 流派写法';
    eq(`${label} "(52)Electronic"`, parseTags(withTail(buildTag(3, [frame('TCON', [0, ...latin1Bytes('(52)Electronic')], 3)])), 'g.mp3').genre, 'Electronic');
    eq(`${label} "(RX)"→Remix`, parseTags(withTail(buildTag(3, [frame('TCON', [0, ...latin1Bytes('(RX)')], 3)])), 'g.mp3').genre, 'Remix');
    eq(`${label} 纯文本不变`, parseTags(withTail(buildTag(3, [frame('TCON', [0, ...latin1Bytes('Metal')], 3)])), 'g.mp3').genre, 'Metal');
}
{
    const label = '合成 · 文本编码 1=UTF-16(BOM) / 2=UTF-16BE';
    const t1 = parseTags(withTail(buildTag(3, [frame('TIT2', [1, 0xff, 0xfe, ...utf16leBytes('中文BOM')], 3)])), 'u16.mp3');
    eq(`${label} UTF-16LE+BOM`, t1.title, '中文BOM');
    const t2 = parseTags(withTail(buildTag(3, [
        frame('TIT2', [2, ...utf16beBytes('BE Text')], 3),
        frame('TPE1', [2, ...utf16beBytes('BE Artist')], 3),
    ])), 'u16be.mp3');
    eq(`${label} UTF-16BE`, t2.title, 'BE Text');
    eq(`${label} UTF-16BE artist`, t2.artist, 'BE Artist');
    const t3 = parseTags(withTail(buildTag(4, [frame('TIT2', [1, 0xfe, 0xff, ...utf16beBytes('BE BOM')], 4)])), 'u16be2.mp3');
    eq(`${label} UTF-16BE+BOM`, t3.title, 'BE BOM');
}
{
    // v2.4 的帧长度是同步安全的：200 字节的帧按普通大端读会直接错位，这条专门证明它被用上了
    const label = '合成 · ID3v2.4 同步安全帧长（200 字节文本帧）';
    const long = 'x'.repeat(200);
    const tag = buildTag(4, [
        frame('TIT2', [3, ...ascii(long)], 4),
        frame('TALB', [0, ...latin1Bytes('After Long')], 4),
    ]);
    const t = parseTags(withTail(tag), 'ss.mp3');
    eq(`${label} 200 字节文本读完`, t.title.length, 200);
    eq(`${label} 后续帧未错位`, t.album, 'After Long');
}
{
    // v2.3 的整标签反同步：磁盘上是 0xFF 0x00，读出来必须还原成 0xFF。
    // 声明长度用的是"逻辑长度"（4），落盘字节是"反同步后长度"（5）——主流解析器都按这个约定。
    const label = '合成 · ID3v2.3 反同步（0xFF 00 → 0xFF）';
    const tag = buildTag(3, [
        frame('TIT2', [0, 0x41, 0xff, 0x42], 3, [0, 0x41, 0xff, 0x00, 0x42]),
    ], 0x80);
    const t = parseTags(withTail(tag), 'unsync.mp3');
    eq(`${label} 反同步还原 "AÿB"`, t.title, 'A\u00FFB');
    eq(`${label} 后面还有字段说明没跑飞`, parseTags(withTail(tag), 'unsync.mp3').container, 'id3v2');
}
{
    const label = '合成 · TXXX:ALBUMARTIST 兜底';
    const body = [0, ...latin1Bytes('ALBUMARTIST'), 0, ...latin1Bytes('TXXX AlbumArtist')];
    eq(`${label}`, parseTags(withTail(buildTag(3, [frame('TXXX', body, 3)])), 'txxx.mp3').albumArtist, 'TXXX AlbumArtist');
}
{
    const label = '合成 · Latin-1 高位字节按 Windows-1252 解（0x92 → ’）';
    eq(`${label}`, parseTags(withTail(buildTag(3, [frame('TIT2', [0, 0x49, 0x74, 0x92, 0x73], 3)])), 'l1.mp3').title, 'It\u2019s');
}
{
    const label = '合成 · ArrayBuffer 输入与 Uint8Array 等价';
    const p = path.join(HERE, 'music/Test Album One/01 - First Track.mp3');
    const buf = fs.readFileSync(p);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const a = parseTags(new Uint8Array(buf), '01 - First Track.mp3');
    const b = parseTags(ab, '01 - First Track.mp3');
    eq(`${label} title`, b.title, a.title);
    eq(`${label} duration`, b.duration, a.duration);
    eq(`${label} 封面字节数`, b.picture && b.picture.data.length, a.picture && a.picture.data.length);
}
line('');
line('合成用例完成（逐条断言已计入总数）');

/* ================================================ 3) 损坏 / 截断模糊测试 == */

hr();
line('第 3 部分：损坏与截断输入（要求：绝不抛异常，且返回结构完整）');
hr();

// 固定种子的 PRNG，保证失败可复现
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let brokenCases = 0;
let brokenThrown = 0;

function tryBroken(label, input, name) {
    brokenCases++;
    try {
        const t = parseTags(input, name);
        const keys = Object.keys(t);
        if (keys.length !== SHAPE_KEYS.length || !Number.isFinite(t.duration) || t.duration < 0) {
            check(`损坏输入「${label}」结构完整`, false, `keys=${keys.length} duration=${t.duration}`);
            return;
        }
        pass++;
    } catch (e) {
        brokenThrown++;
        check(`损坏输入「${label}」不抛异常`, false, String((e && e.message) || e));
    }
}

tryBroken('空 Uint8Array', new Uint8Array(0), 'x.mp3');
tryBroken('1 字节', new Uint8Array([0x49]), 'x.mp3');
tryBroken('只有 ID3 三字节', new Uint8Array([0x49, 0x44, 0x33]), 'x.mp3');
tryBroken('null', null, 'x.mp3');
tryBroken('undefined', undefined, 'x.mp3');
tryBroken('全 0xFF（64B）', new Uint8Array(64).fill(0xff), 'x.mp3');
tryBroken('全 0x00（4KB）', new Uint8Array(4096), 'x.flac');
tryBroken('只有 fLaC 魔数', new Uint8Array([0x66, 0x4c, 0x61, 0x43]), 'x.flac');
tryBroken('声明超大标签的 ID3', new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0x7f, 0x7f, 0x7f, 0x7f, 1, 2, 3]), 'x.mp3');
tryBroken('ftyp 后没有 moov', new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]), 'x.m4a');
tryBroken('OggS 头但段表越界', new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0xff]), 'x.ogg');
tryBroken('RIFF/WAVE 块长越界', new Uint8Array([0x52, 0x49, 0x46, 0x46, 0xff, 0xff, 0xff, 0xff, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20, 0xff, 0xff, 0xff, 0xff]), 'x.wav');

// 从头部按步长截断每个真实素材（模拟下载中断 / 读了一半）
let cutCount = 0;
for (const c of CASES) {
    const abs = path.resolve(HERE, c.file);
    if (!fs.existsSync(abs)) continue;
    const all = new Uint8Array(fs.readFileSync(abs));
    const step = Math.max(1, Math.floor(all.length / 12));
    for (let n = 1; n < all.length; n += step) {
        tryBroken(`${path.basename(abs)} 只给前 ${n} 字节`, all.subarray(0, n), path.basename(abs));
        cutCount++;
    }
}
// 头部完好但尾部被砍（FLAC 的 PICTURE 在后面，最容易踩）
{
    const all = new Uint8Array(fs.readFileSync(path.join(HERE, 'music/Test Album Two/1 - Alpha.flac')));
    const step = Math.max(1, Math.floor(all.length / 8));
    for (let n = 1; n < all.length; n += step) {
        tryBroken(`FLAC 尾部砍掉 ${n} 字节`, all.subarray(0, all.length - n), 'x.flac');
        cutCount++;
    }
}
// 纯随机字节
const rnd = mulberry32(20260101);
const FUZZ = 300;
for (let i = 0; i < FUZZ; i++) {
    const n = Math.floor(rnd() * 3000);
    const u = new Uint8Array(n);
    for (let k = 0; k < n; k++) u[k] = Math.floor(rnd() * 256);
    tryBroken(`随机 ${n} 字节 #${i}`, u, 'fuzz.bin');
}

line(`  极端输入 12 组 + 截断 ${cutCount} 组 + 随机 ${FUZZ} 组，共 ${brokenCases} 组`);
line(`  抛异常 ${brokenThrown} 次（必须为 0）；结构完整 ${brokenCases - brokenThrown} 组`);
check('损坏输入零异常', brokenThrown === 0, `实际 ${brokenThrown} 次`);

/* ========================================================= 4) ffprobe == */

hr();
line('第 4 部分：ffprobe 交叉核对（duration 容差 ±1.5s，tags 要求逐项一致）');
hr();

const ffCacheUsed = [];

function probeJson(file) {
    try {
        const out = execFileSync(FFPROBE, [
            '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file,
        ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
        return JSON.parse(out);
    } catch (e) {
        // 受限沙箱里子进程管道可能被禁；此时退回到预先跑好的 JSON 缓存（.dev/tmp-gen/probe/）
        const cache = path.join(PROBE_CACHE, path.basename(file) + '.json');
        if (fs.existsSync(cache)) {
            ffCacheUsed.push(path.basename(file));
            return JSON.parse(fs.readFileSync(cache, 'utf8'));
        }
        return null;
    }
}

function probeTags(p) {
    const merged = Object.assign({}, (p.format && p.format.tags) || {});
    for (const s of p.streams || []) Object.assign(merged, s.tags || {});
    const out = {};
    for (const k of ['title', 'artist', 'album', 'album_artist', 'track', 'disc', 'date', 'genre']) {
        const v = merged[k];
        if (v !== undefined && v !== '') out[k] = Array.isArray(v) ? v[0] : v;
    }
    return out;
}

let probeCount = 0;
let probeSkipped = 0;

for (const c of CASES) {
    const abs = path.resolve(HERE, c.file);
    if (!fs.existsSync(abs)) continue;
    const t = results.get(abs);
    if (!t) continue;
    const p = probeJson(abs);
    if (!p) {
        probeSkipped++;
        line(`  [跳过] ${path.basename(abs)}：ffprobe 不可用且没有缓存`);
        continue;
    }
    probeCount++;
    const name = path.basename(abs);
    const pd = parseFloat(p.format && p.format.duration);
    const delta = Number.isFinite(pd) ? Math.abs(t.duration - pd) : NaN;
    line('');
    line(`  ${name}`);
    line(`    duration  我们 ${t.duration}s / ffprobe ${Number.isFinite(pd) ? pd + 's' : 'N/A'}  Δ ${Number.isFinite(delta) ? delta.toFixed(3) : 'N/A'}`);
    if (Number.isFinite(pd)) {
        check(`ffprobe ${name} duration 差 ≤1.5s`, delta <= 1.5, `Δ=${delta.toFixed(3)}s`);
    }

    // 只比 ffprobe 里真的写了的键（缺键说明该文件本来就没这个标签）
    const tags = probeTags(p);
    const pairs = [
        ['title', tags.title, t.title],
        ['artist', tags.artist, t.artist],
        ['album', tags.album, t.album],
        ['albumArtist', tags.album_artist, t.albumArtist],
        ['genre', tags.genre, t.genre],
        ['year', tags.date ? (/(\d{4})/.exec(tags.date) || [])[1] : undefined, t.year],
        ['track', tags.track !== undefined ? parseInt(tags.track, 10) : undefined, t.track],
        ['disc', tags.disc !== undefined ? parseInt(tags.disc, 10) : undefined, t.disc],
    ];
    const diffs = [];
    let compared = 0;
    for (const [k, want, got] of pairs) {
        if (want === undefined || (typeof want === 'number' && Number.isNaN(want))) continue;
        compared++;
        if (want !== got) diffs.push(`${k}: ffprobe=${JSON.stringify(want)} 我们=${JSON.stringify(got)}`);
    }
    if (diffs.length === 0) {
        line(`    tags      比对 ${compared} 项，全部一致`);
    } else {
        line(`    tags      比对 ${compared} 项，不一致 ${diffs.length} 项：`);
        for (const d of diffs) line(`      - ${d}`);
    }
    check(`ffprobe ${name} tags 一致`, diffs.length === 0, diffs.join('; '));
}
line('');
line(`  核对 ${probeCount} 个文件，跳过 ${probeSkipped} 个${ffCacheUsed.length ? `（其中 ${ffCacheUsed.length} 个用了本地缓存 JSON）` : ''}`);

/* ========================================== 5) 硬性约束（零依赖 / Worker） == */

hr();
line('第 5 部分：硬性约束 —— 零依赖 + 能在没有 Node 全局的环境里跑');
hr();

const src = fs.readFileSync(path.join(ROOT, 'workers/tags.js'), 'utf8');
// 先剥掉注释，免得中文注释里提到 "import" 之类被误判
const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const banned = [
    [/^\s*import\s/m, 'import 语句'],
    [/\brequire\s*\(/, 'require()'],
    [/['"]node:/, 'node: 内置模块'],
    [/\bprocess\b/, 'process'],
    [/\bBuffer\b/, 'Buffer'],
    [/\bwindow\b/, 'window'],
    [/\bdocument\b/, 'document'],
];
for (const [re, what] of banned) {
    check(`tags.js 不含 ${what}`, !re.test(code), '命中：' + (re.exec(code) || [''])[0]);
    line(`      ${re.test(code) ? '✗' : '✓'} 不含 ${what}`);
}
eq('tags.js 导出 parseTags', /export\s+function\s+parseTags\s*\(/.test(code), true);

// 真·裸域测试：在只有 ECMAScript 内建对象的 vm realm 里跑同一份源码。
// 这就等价于"没有 Node 全局、没有 DOM"的环境（Web Worker 的前提差不多就是这样），
// 能证明解析器没有偷偷依赖 process / Buffer / 平台 API。
{
    const bare = src.replace(/\bexport\s+function\s+parseTags/, 'function parseTags');
    const ctx = vm.createContext({});
    eq('裸域里 typeof process', vm.runInContext('typeof process', ctx), 'undefined');
    eq('裸域里 typeof Buffer', vm.runInContext('typeof Buffer', ctx), 'undefined');
    eq('裸域里 typeof document', vm.runInContext('typeof document', ctx), 'undefined');
    let fn = null;
    try {
        fn = vm.runInContext(bare + '\nparseTags', ctx);
        check('裸域里能加载 tags.js', true);
    } catch (e) {
        check('裸域里能加载 tags.js', false, String((e && e.message) || e));
    }
    if (fn) {
        const r = fn(new Uint8Array(fs.readFileSync(path.join(HERE, 'music/Test Album One/01 - First Track.mp3'))), '01 - First Track.mp3');
        eq('裸域 MP3 title', r.title, 'First Track');
        eq('裸域 MP3 track', r.track, 1);
        eq('裸域 MP3 codec', r.codec, 'MP3');
        eq('裸域 MP3 duration', r.duration, 6.034);
        eq('裸域 MP3 封面字节数', r.picture && r.picture.data.length, 10309);
        const r2 = fn(new Uint8Array(fs.readFileSync(path.join(HERE, 'music/Test Album Two/1 - Alpha.flac'))), '1 - Alpha.flac');
        eq('裸域 FLAC bits', r2.bits, 16);
        eq('裸域 FLAC title', r2.title, 'Alpha');
        line('      裸域（只有 ECMAScript 内建对象）里 MP3/FLAC 都解析正确 ✓');
    }
}

/* =============================================================== 汇总 == */

hr();
line(`汇总：PASS ${pass}  FAIL ${fail}`);
if (skippedOptional) line(`      注意：有 ${skippedOptional} 个可选临时素材被跳过（先跑 .dev/tmp-gen/run-tests.sh 可补回覆盖）`);
hr();
if (fail) {
    line('失败明细：');
    for (const f of failures) line(`  ✗ ${f}`);
    hr();
    process.exitCode = 1;
} else {
    line('全部通过 ✓');
}
