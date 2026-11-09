# Publishing ArrangeIt to GitHub

Target repository: **`mubareksam/Arrangeit`** (`https://github.com/mubareksam/Arrangeit.git`).

## 1. Confirm the local state

```bash
git status                 # clean
npm run build              # must pass: tsc --noEmit && vite build
```

`node_modules/`, `dist/` and `src-tauri/target/` are ignored — never commit them.

## 2. Create the repo (first time only)

```bash
gh repo view mubareksam/Arrangeit >/dev/null 2>&1 \
  || gh repo create mubareksam/Arrangeit --public \
       --description "Local-first file organizer — Rust + Tauri 2 + React" \
       --source=. --remote=origin
```

If the remote already exists, just verify it:

```bash
git remote -v              # origin  https://github.com/mubareksam/Arrangeit.git
```

## 3. Push

```bash
git push -u origin main
```

## 4. Verify

```bash
gh repo view mubareksam/Arrangeit --web
git ls-remote --heads origin
```

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `403 Resource not accessible by personal access token` | The GitHub App installation is limited to *selected repositories* | GitHub → Settings → Applications → *Installations* → configure → tick **Arrangeit** → Save, then push again |
| `remote origin already exists` | Repo was created earlier | `git remote set-url origin https://github.com/mubareksam/Arrangeit.git` |
| `src refspec main does not match any` | No commit yet | `git add -A && git commit -m "feat: ArrangeIt"` first |
| `GH008: no commits between main and …` when opening a PR | Branch is identical to `main` | Commit on the feature branch before `gh pr create` |
| Push succeeds but the repo looks empty | Files were added after the commit | `git status` → `git add -A && git commit` → push |
| `failed to push some refs (non-fast-forward)` | Remote moved ahead | `git pull --rebase origin main` then push |

## Release (optional)

```bash
cargo tauri build
gh release create v1.0.0 \
  "src-tauri/target/release/bundle/nsis/ArrangeIt_1.0.0_x64-setup.exe" \
  --title "ArrangeIt 1.0.0" \
  --notes "First release: auto-arrange, duplicate finder, batch rename, folder styles."
```
