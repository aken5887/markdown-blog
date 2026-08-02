---
title: Markdown 블로그 구축 내역
author: YH
created: 2026-08-02
updated: 2026-08-02
tags:
  - Node.js
  - Express
  - Markdown
  - Vanilla JS
---

# Markdown 블로그 구축 내역

개인적으로 쓸 개발 블로그를 Markdown 파일 기반으로 구성했다. 글을 데이터베이스에 넣는 대신 파일로 관리해서, 에디터나 Git으로 바로 열어볼 수 있게 한 것이 핵심이다.

## 구성

- 서버: Node.js + Express
- 프론트엔드: Vanilla JS, 별도 빌드 과정 없음
- 콘텐츠: `posts/<카테고리>/*.md`
- 프론트매터: `gray-matter`로 제목, 등록일, 수정일, 태그 파싱
- Markdown 렌더링: 브라우저에서 `marked.js` 사용
- 코드 블록: `highlight.js`로 문법 강조

## 글 데이터 흐름

글을 저장하면 서버가 제목을 파일명으로 변환해 카테고리 폴더에 Markdown 파일을 만든다. 게시글 식별자는 `posts/meta.json`에서 관리하고, 상세 페이지는 `/posts/:id` 경로로 진입한 뒤 API에서 콘텐츠를 가져와 렌더링한다.

```text
write.html → POST /api/posts → posts/개발/파일명.md
                         └→ posts/meta.json

/posts/:id → GET /api/posts/by-id/:id → post.html 렌더링
```

## 구현한 기능

### 게시글 관리

- 카테고리별 목록 조회
- 게시글 작성, 수정, 삭제
- Markdown 파일 가져오기
- 이미지 업로드 후 본문에 경로 자동 삽입
- 제목, 태그, 등록일, 수정일 메타데이터 관리

수정 시에는 최초 등록일을 유지하고 `updated` 값만 갱신하도록 처리했다. 상세 페이지에서는 등록일과 수정일을 각각 독립된 줄로 보여준다.

### 조회 경험

- 제목, 본문, 태그를 대상으로 한 전문 검색
- 카테고리 탭 필터
- 다크 모드 및 테마 저장
- 작성 화면의 실시간 Markdown 미리보기

## 쓰기 권한과 배포

로컬 실행 환경은 기본적으로 쓰기가 허용된다. 배포 환경은 실수로 글이 변경되는 것을 막기 위해 읽기 전용으로 시작하고, 필요한 경우 `ALLOW_WRITES=true`로 전환할 수 있다.

글쓰기 API는 공용 비밀번호 인증을 거친 세션 토큰이 있어야 호출할 수 있다. 비밀번호 해시는 `posts/auth.json`에 저장한다.

Render처럼 로컬 디스크가 유지되지 않는 환경에서는 별도 GitHub 데이터 저장소를 연결한다. 서버가 시작될 때 글과 이미지를 내려받고, 변경이 발생하면 커밋과 푸시를 수행하는 방식이다.

## 실행

```bash
npm install
npm run dev
```

서버는 기본적으로 `http://localhost:3000`에서 실행된다. 기능을 수정한 뒤에는 서버를 재시작하고 주요 API 응답을 확인하는 흐름으로 관리한다.
