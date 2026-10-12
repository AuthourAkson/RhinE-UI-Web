#!/usr/bin/env bash
set -u
cd /d/AgentTestLab/RhinE-UI || exit 1
git add -A
git commit -q --amend -F - <<'MSG'
推送脚本重写 + 更正上次的误判（凭据失效，不是"超时"也不是"不需要交互"）

【结论】推送现在需要**一次**交互式登录；之前能自动推是因为当时缓存着有效的写入凭据。
让用户点击这件事我之前说反了两次，这里把实测证据写清楚，避免以后再猜：

  ① 仓库是**公开**的 —— 完全不带凭据也能读取：
       git -c credential.helper= ls-remote https://github.com/AuthourAkson/RhinE-UI-Web.git
       → 成功（退出码 0）
     所以"git ls-remote 通过"**不能**证明凭据可用 ✗ —— 我上次拿它当依据得出
     "完全不需要人工干预"，是错的。

  ② 写入（推送）在禁止交互时直接失败：
       GCM_INTERACTIVE=never GIT_TERMINAL_PROMPT=0 git push --dry-run origin main
       → fatal: could not read Username for 'https://github.com': terminal prompts disabled
     说明凭据库里那几条 git:https://github.com / @AuthourAkson 条目
     **不能用于本仓库的推送**（已失效或无写权限），GCM 只能弹窗要一次登录。

  ③ 之前几次"退出码 124 超时"是另一回事：本机到 github 链路偶发 SSL_ERROR_SYSCALL，
     叠加我当时用的 `timeout 60` 太短；那次去掉超时后台跑，GCM 弹窗被登录后推送成功
     （16f96cf..dcd9539）。

【脚本改动】.dev/git-push-retry.sh 重写：
  · GCM_INTERACTIVE=never —— 真需要登录时**立刻报错**，不再静默挂住、也不再被我误读成"超时"
  · 超时 60 → 300 秒，最多 3 次（对付网络抖动）
  · 三次都失败时自动区分：只读能过但推送要 prompt → 结论就是"写入凭据需要登录一次"，直接讲明
MSG
echo "已提交（amend）："; git log --oneline -1
"本地 HEAD = " + "$(git rev-parse --short HEAD)" + "   远端 = " + "$(git rev-parse --short origin/main)"
