// 独立读 ID3v2 帧头（不经项目解析器），看这些文件到底有没有标题/艺人标签
const { readFileSync, readdirSync } = await import('node:fs');
const dir = 'D:\\AgentTestLab\\RhinE-UI\\musiclab';

function id3v2(buf) {
  if (buf.length < 10 || buf.toString('latin1', 0, 3) !== 'ID3') return null;
  const ver = buf[3];
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  const frames = [];
  let p = 10;
  const idLen = ver === 2 ? 3 : 4, szLen = ver === 2 ? 3 : 4;
  while (p + idLen + szLen + 2 <= 10 + size && p + 10 < buf.length) {
    const id = buf.toString('latin1', p, p + idLen);
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    let fsz;
    if (ver === 2) fsz = (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5];
    else if (ver === 4) fsz = ((buf[p + 4] & 0x7f) << 21) | ((buf[p + 5] & 0x7f) << 14) | ((buf[p + 6] & 0x7f) << 7) | (buf[p + 7] & 0x7f);
    else fsz = buf.readUInt32BE(p + 4);
    if (fsz <= 0 || p + idLen + szLen + fsz > buf.length) break;
    const body = buf.subarray(p + idLen + szLen, p + idLen + szLen + fsz);
    frames.push({ id, size: fsz, body });
    p += idLen + szLen + fsz;
  }
  return { ver, size, frames };
}
const text = (fr) => {
  const enc = fr.body[0];
  let s = fr.body.subarray(1);
  try { s = enc === 1 || enc === 2 ? Buffer.from(new TextDecoder('utf-16').decode(s)) : s; } catch (e) { }
  return Buffer.from(s).toString(enc === 1 ? 'utf16le' : 'latin1').replace(/\0/g, '').trim();
};

for (const name of readdirSync(dir).filter((f) => /\.mp3$/i.test(f))) {
  const buf = readFileSync(dir + '\\' + name);
  const t = id3v2(buf);
  if (!t) { console.log('── ' + name + '：**没有 ID3v2 标签**（裸 MP3）'); continue; }
  const interesting = t.frames.filter((f) => /^(TIT2|TPE1|TPE2|TALB|TYER|TDRC|TRCK|APIC|USLT|COMM)$/.test(f.id));
  console.log('── ' + name + '：ID3v' + t.ver + '，共 ' + t.frames.length + ' 帧');
  for (const f of interesting) {
    if (f.id === 'APIC') { console.log('     APIC 封面 ' + f.size + ' 字节'); continue; }
    console.log('     ' + f.id + ' = ' + JSON.stringify(text(f).slice(0, 60)));
  }
  if (!interesting.length) console.log('     （有标签但没有标题/艺人/专辑帧）');
}
