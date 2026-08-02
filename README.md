# markdown-blog

로컬에서도, 웹에서도 쓰는 개인 개발 블로그. velog 스타일 디자인, MD 파일 기반 아티클 관리.

---

## 로컬 실행 (기존과 동일)

```bash
npm install
npm run dev   # nodemon — 파일 변경 시 자동 재시작
# 또는
npm start
# http://localhost:3000
```

`.env` 파일을 만들지 않으면(또는 비워두면) `DATA_REPO_URL` / `GITHUB_TOKEN`이 없는 상태로 실행되고,
이 경우 원래 버전과 완전히 동일하게 `posts/`, `public/images/`를 이 컴퓨터에 직접 읽고 씁니다.
로컬(`NODE_ENV`가 `production`이 아닐 때)에서는 글쓰기 · 수정 · 삭제 · 비밀번호 UI가 그대로 보입니다.

---

## 웹 배포 (Render + GitHub 데이터 저장소)

Render 무료 웹서비스는 도메인(`*.onrender.com`)을 자동으로 주고 서버 관리가 필요 없지만,
**디스크가 영구 저장이 안 돼서** 재배포/재시작마다 로컬에 쓴 파일이 사라집니다.
그래서 `posts/`와 이미지를 별도의 GitHub 저장소에 커밋해서 영구 보관하도록 만들었습니다
(`dataSync.js`). 서버가 켜질 때 이 저장소를 clone/pull 합니다.

**프로덕션(Render)은 읽기 전용입니다.** `NODE_ENV=production`이면 글쓰기/수정/삭제/비밀번호
버튼이 숨겨지고, 관련 API도 `403`을 반환합니다. 글은 로컬에서 작성한 뒤 데이터 저장소에
반영하거나, 필요하면 `ALLOW_WRITES=true`로 쓰기 UI를 다시 켤 수 있습니다.

### 1. 데이터 저장소 만들기

GitHub에서 새 **빈 저장소**를 하나 만듭니다 (예: `markdown-blog-data`).
**"Add a README file" 체크박스를 꼭 켜세요** — 커밋이 하나도 없는 저장소는 clone이 안 됩니다.

### 2. GitHub 토큰 발급

https://github.com/settings/personal-access-tokens/new 에서 fine-grained 토큰을 만듭니다.

- Repository access: 방금 만든 `markdown-blog-data` 저장소만 선택
- Permissions: **Contents → Read and write**

### 3. 이 프로젝트를 코드 저장소로 GitHub에 push

`markdown-blog-data`와는 **별개의** 저장소입니다 (코드용 vs 데이터용).

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/yourname/markdown-blog.git
git push -u origin main
```

### 4. Render에 배포 + 자동 배포(CI/CD)

`render.yaml` Blueprint가 포함되어 있습니다. push할 때마다 자동으로 재배포됩니다.

**방법 A — Blueprint (권장)**

1. https://render.com 가입 → **New → Blueprint**
2. GitHub에서 이 코드 저장소 연결 · `render.yaml` 감지 확인
3. `DATA_REPO_URL`, `GITHUB_TOKEN` 값을 입력 (Blueprint의 `sync: false` 항목)
4. Apply → 첫 배포 후, **같은 브랜치에 push할 때마다 자동 재배포**

**방법 B — Web Service 수동 연결**

1. New → Web Service → GitHub 저장소 선택
2. Build: `npm install --omit=dev` / Start: `npm start`
3. Auto-Deploy: **Yes** (기본값)
4. Environment:
   - `NODE_ENV` = `production`
   - `ALLOW_WRITES` = `false`
   - `DATA_REPO_URL` = `https://github.com/yourname/markdown-blog-data.git`
   - `GITHUB_TOKEN` = 2단계 토큰

**방법 C — GitHub Actions Deploy Hook (선택)**

네이티브 자동 배포 대신 Actions로 트리거하려면:

1. Render → 서비스 → Settings → **Deploy Hook** URL 복사
2. GitHub → Settings → Secrets → Actions → `RENDER_DEPLOY_HOOK` 추가
3. `.github/workflows/deploy-render.yml`이 `main`/`master` push 시 hook을 호출합니다

무료 웹서비스는 15분간 요청이 없으면 잠들고, 다음 요청에서 다시 깨어나는 데 최대 1분 정도
걸릴 수 있습니다. 개인 블로그 용도로는 문제없는 수준입니다.

---

## 읽기 전용 / 쓰기 모드

| 환경 | 기본 동작 |
|---|---|
| 로컬 (`npm run dev` / `npm start`) | 쓰기 UI · API 허용 |
| Render (`NODE_ENV=production`) | 읽기 전용 (글쓰기/수정/삭제/비밀번호 UI 숨김) |

`ALLOW_WRITES=true|false`로 언제든 덮어쓸 수 있습니다. 클라이언트는 `GET /api/config`의
`writable` 필드를 보고 버튼을 표시합니다.

## 기술 스택

- **서버**: Node.js + Express 4
- **프론트**: Vanilla JS (빌드 없음)
- **MD 렌더링**: marked.js v4 (CDN, 클라이언트)
- **코드 하이라이팅**: highlight.js 11 (CDN)
- **프론트매터 파싱**: gray-matter (서버)
- **파일 업로드**: multer (서버, 메모리 스토리지)
- **데이터 영속화**: simple-git으로 GitHub 저장소에 commit/push (Render 등 배포 시에만 활성화)

---

## 디렉터리 구조

```
markdown-blog/
├── server.js            # Express 서버 (모든 API)
├── auth.js               # 비밀번호 · 세션 토큰
├── dataSync.js           # GitHub 기반 영속화 (없으면 로컬 모드로 자동 폴백)
├── render.yaml           # Render Blueprint (자동 배포)
├── nodemon.json
├── start.bat             # Windows 실행 스크립트
├── package.json
├── .env.example
├── .github/workflows/    # (선택) Deploy Hook 기반 Actions
├── posts/
│   ├── meta.json         # 포스트 ID 매핑 [{id, category, filename}]
│   ├── 개발/
│   ├── 삽질/
│   └── 공부/
└── public/
    ├── favicon.svg
    ├── index.html        # 홈 (카드 목록)
    ├── post.html          # 아티클 읽기 (/posts/:id 라우트가 이 파일 반환)
    ├── write.html         # 글쓰기 / 수정 (프로덕션에서는 차단)
    ├── css/style.css
    └── js/
        ├── config.js      # /api/config → writable 여부
        ├── main.js        # 홈 로직 (목록, 검색, 카테고리 탭)
        ├── post.js        # 아티클 페이지 로직
        ├── write.js       # 글쓰기 / 수정 / 이미지 업로드
        └── auth.js        # 비밀번호 모달
```

## 카테고리

`server.js` 상단에 하드코딩 (`CATEGORIES = ['개발', '삽질', '공부']`). 추가하려면 이 배열만 수정하면
`write.html`의 select도 자동으로 반영됩니다 (서버에서 내려주는 `/api/categories`를 씀).

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/posts/:id` | 아티클 페이지 (post.html 반환, SPA) |
| GET | `/api/config` | `{ writable, syncEnabled, env }` — UI 표시 여부 |
| GET | `/api/posts` | 전체/카테고리별 목록 (`?category=개발`) |
| GET | `/api/posts/by-id/:id` | ID로 아티클 조회 |
| GET | `/api/posts/:category/:filename` | category+filename으로 조회 |
| POST | `/api/posts` | 에디터 작성 저장 (JSON body) |
| PUT | `/api/posts/:category/:filename` | 수정 (`{content, newCategory}`) |
| DELETE | `/api/posts/:category/:filename` | 삭제 |
| POST | `/api/upload` | MD 파일 업로드 (multipart) |
| POST | `/api/images` | 이미지 업로드 → `/images/파일명` 반환 |
| GET | `/api/search` | 전문 검색 (`?q=키워드`) |
| GET | `/api/auth/status` | 비밀번호 설정 여부 확인 |
| POST | `/api/auth/set-password` | 최초 비밀번호 설정 |
| POST | `/api/auth/verify` | 비밀번호 확인 → 세션 토큰 발급 |
| POST | `/api/auth/change-password` | 비밀번호 변경 |

> **인증**: POST/PUT/DELETE `/api/posts*`와 `/api/upload`는 `x-auth-token` 헤더가 필요합니다.
> `/api/auth/verify` 또는 `/api/auth/set-password`로 발급받은 토큰을 사용하세요 (유효시간 30분).
>

> **주의**: `/api/posts/by-id/:id` 라우트는 반드시 `/api/posts/:category/:filename` 보다 먼저
> 등록해야 합니다. 안 그러면 category/filename 라우트가 by-id 요청을 가로챕니다.

## 새로 추가된 기능

- **검색 팝업**: 헤더의 🔍 아이콘 클릭 시 모달로 검색 (`/api/search` 사용, 결과 클릭 시 바로 아티클로 이동)
- **다크 모드**: 헤더의 슬라이드 토글로 전환, `localStorage`에 저장되어 재방문 시에도 유지되고 모든 페이지에 적용됨
- **글쓰기 화면 실시간 미리보기**: 입력창과 렌더링 결과를 좌우로 동시에 표시 (탭 전환 없음)
- **비밀번호 보호**: 글쓰기 · 수정 · 삭제 시 비밀번호 확인 모달이 뜸
  - 아직 비밀번호가 없으면 "비밀번호 설정" 화면, 있으면 "비밀번호 확인" 화면이 나옴
  - 확인 화면 하단의 "비밀번호 변경"으로 언제든 변경 가능
  - 비밀번호 해시는 `posts/auth.json`에 저장되고, 다른 데이터처럼 데이터 저장소에 커밋됨
  - 인증은 세션 토큰(30분) 방식이라 서버 재시작 시 다시 입력해야 함 — 개인 블로그 용도로는 충분한 수준

> **보안 참고**: `markdown-blog-data` 저장소를 **Private**로 만드세요. 비밀번호는 해시로 저장되지만,
> 저장소가 Public이면 해시가 그대로 노출되어 오프라인 대입 공격에 쓰일 수 있습니다.

## 알려진 제한사항

- 기존에 로컬에만 있던 글/이미지는 자동으로 옮겨지지 않습니다. 배포 전에 `posts/`, `public/images/`
  안의 파일을 데이터 저장소(`markdown-blog-data`)에 직접 복사해 커밋해두면 이어서 쓸 수 있습니다.
- 이미지가 git 저장소에 그대로 쌓이는 구조라, 이미지가 아주 많아지면 저장소 용량이 커집니다.
  나중에 필요하면 이미지만 Cloudinary 같은 외부 스토리지로 옮기는 방향으로 확장 가능합니다.
- 다크 모드, 비밀번호 보호 기능은 구현되었지만, TOC 자동생성 · 태그 페이지 · 정렬 옵션은 아직 미구현입니다.
