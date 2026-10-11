// 用项目自己的标签解析器直接读 musiclab 的每个文件，看是否真的有标签被漏读
const { readFileSync, readdirSync } = await import('node:fs');
const path = await import('node:path');
const dir = 'D:\\AgentTestLab\\RhinE-UI\\musiclab';
const { parseTags } = await import('file:///D:/AgentTestLab/RhinE-UI/workers/tags.js');

for (const name of readdirSync(dir).filter((f) => /\.(mp3|flac|m4a|ogg|wav)$/i.test(f))) {
  const bytes = new Uint8Array(readFileSync(path.join(dir, name)));
  let t = null, err = '';
  try { t = parseTags(bytes, path.join(dir, name)); } catch (e) { err = e.message; }
  console.log('── ' + name + '  (' + (bytes.length / 1024).toFixed(0) + ' KB)');
  if (err) { console.log('   解析抛错: ' + err); continue; }
  if (!t) { console.log('   解析返回 null'); continue; }
  console.log('   标题=' + JSON.stringify(t.title) + '  艺人=' + JSON.stringify(t.artist) + '  专辑=' + JSON.stringify(t.album) +
    '  专辑艺人=' + JSON.stringify(t.albumArtist) + '  年份=' + JSON.stringify(t.year) + '  音轨=' + t.track +
    '  时长=' + (t.duration || 0).toFixed(1) + '  编码=' + t.codec + '  ' + (t.kbps || 0) + 'kbps ' + (t.bits || 0) + 'bit ' + (t.rate || 0) + 'Hz  封面=' + (t.picture ? '有' : '无'));
}
