# Markdown Blog

Obsidian Vault의 Markdown 문서를 그대로 웹 아티클로 보여주는 개인 블로그입니다. 글과 첨부 이미지를 `posts/` 폴더에서 관리하므로, Obsidian에서 작성한 내용을 별도의 내보내기 과정 없이 블로그에서 읽을 수 있습니다.

## 스펙

- Node.js 18+ / Express
- Vanilla JavaScript, 별도 프론트엔드 빌드 과정 없음
- Markdown 파싱: gray-matter, marked.js
- 코드 블록 강조: highlight.js
- 이미지 업로드: multer
- Obsidian 임베드 지원: `![[이미지.png]]`, `![[이미지.png|400]]`
- 로컬 파일 기반 콘텐츠 관리 및 선택적 GitHub 동기화

## 구조

```text
markdown-blog/
├── server.js                 # 웹 서버와 게시글 API
├── posts/                    # Obsidian Vault로 함께 사용하는 콘텐츠 폴더
│   ├── images/               # Obsidian·블로그 공용 이미지 첨부 폴더
│   ├── meta.json             # 게시글 ID 매핑
│   ├── 개발/
│   ├── 삽질/
│   └── 공부/
└── public/                   # 블로그 화면
    ├── index.html            # 메인 게시글 목록
    ├── post.html             # 상세 아티클
    └── write.html            # 글 작성·수정
```

## 카테고리

기본 카테고리는 `개발`, `삽질`, `공부`입니다. 각 카테고리 폴더 안의 Markdown 파일은 자동으로 게시글 목록에 반영됩니다.

카테고리를 추가하거나 변경하려면 `server.js`의 `CATEGORIES` 값을 수정합니다.

## 사용 방법

### 실행

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000`을 엽니다.

### Obsidian에서 글 작성하기

1. Obsidian에서 이 프로젝트의 `posts/` 폴더를 Vault로 엽니다.
2. 원하는 카테고리 폴더에 Markdown 파일을 만듭니다.
3. 아래처럼 프론트매터와 본문을 작성합니다.

```md
---
title: 글 제목
created: '2026-08-07'
updated: '2026-08-07'
tags:
  - Markdown
  - Obsidian
---

본문을 작성합니다.
```

저장한 Markdown 파일은 다음 목록 조회 때 자동으로 아티클로 등록됩니다. `title`이 없으면 파일명을 제목으로 사용하며, 등록일과 수정일도 없으면 파일 시간을 기준으로 채웁니다.

### 이미지 사용하기

이미지는 `posts/images/`에 저장합니다. Obsidian 문법과 일반 Markdown 문법을 모두 사용할 수 있습니다.

```md
![[이미지.png]]
![](images/이미지.png)
```

블로그에서도 같은 이미지를 렌더링하며, 상세 페이지에서는 이미지를 클릭해 확대할 수 있습니다.
