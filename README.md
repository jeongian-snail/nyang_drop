# 냥냥 드롭

같은 단계의 고양이 얼굴을 합쳐 다음 단계로 만드는 브라우저 게임입니다.

- [플레이하기](https://jeongian-snail.github.io/nyang_drop/)
- JavaScript ES modules · HTML · CSS · Matter.js
- 별도 서버나 빌드 과정 없이 정적 파일로 실행합니다.

## GitHub Pages 배포

배포 주소는 <https://jeongian-snail.github.io/nyang_drop/>입니다.

저장소의 **Settings → Pages → Build and deployment → Source**를
**GitHub Actions**로 설정합니다. `main`에 push하면 기존 서식·린트·테스트 검사를
통과한 뒤 `dist/`의 정적 파일만 배포합니다. Pull request와 다른 브랜치에서는
검사만 실행하며 배포하지 않습니다.

처음 Pages를 활성화한 뒤에는 **Actions → CI and GitHub Pages → Run workflow**에서
`main`을 선택해 배포할 수 있습니다. 이후에는 `main` 변경 때마다 자동 배포됩니다.
검사가 실패하면 배포하지 않으며, 이전에 배포한 게임은 유지됩니다.

게임의 이미지·스크립트·음원은 상대 경로를 사용하므로 `/nyang_drop/` 아래에서도
동작합니다. 최고 기록과 음량 설정은 방문한 브라우저에 저장되며, 기존 사이트의
기록은 주소가 달라 자동 이전되지 않습니다.

## 같은 시드로 플레이하기

게임판 위의 **시드** 입력창에 같은 글자나 숫자를 입력하고 **적용**을 누르면,
첫 고양이부터 같은 순서로 등장합니다. 진행 중인 판이 있으면 초기화를 확인합니다.
입력만 바꾸면 진행 중인 판에는 영향을 주지 않습니다. 시드를 적용하면 정리된 시드가 입력창에 표시됩니다.

- 시드는 최대 64자이며 대소문자를 구분합니다. 앞뒤 공백은 무시하고 유니코드를 NFC로 정규화합니다.
- 빈 입력을 적용하면 새 랜덤 시드를 생성합니다. 상대에게 현재 시드를 그대로 전달하면 됩니다.
- **다시 시작**은 현재 시드의 순서를 처음부터 재현합니다.
- 설정(톱니바퀴)에서 다음 고양이 미리보기를 켜고 끌 수 있습니다. 기본값은 꺼짐이며 선택은 브라우저에 저장됩니다. 지금 떨어뜨릴 고양이는 항상 보입니다.
- 고양이 생성 순서만 동일합니다. 떨어뜨리는 위치·시점에 따라 합성 결과와 점수는 달라집니다.
- 생성 순서는 효과음·애니메이션 난수와 분리되어 있습니다. 온라인 방·점수 동기화 기능은 포함하지 않습니다.

## 개발 환경

Node.js 24와 npm을 사용합니다. 의존성 버전은 `package-lock.json`에 고정합니다.

```sh
npm ci
npm run check
```

게임을 실행할 때는 정적 HTTP 서버의 문서 루트를 `dist/`로 지정하세요.
Python이 설치되어 있다면 다음 명령을 사용할 수 있습니다.

```sh
python3 -m http.server 8000 --directory dist
```

Windows에서는 `python3` 대신 `py`를 사용할 수 있습니다.
실행 후 `http://localhost:8000`에 접속하세요. ES modules를 사용하므로
`index.html`을 `file://` 주소로 직접 열면 정상 실행되지 않습니다.

## 명령어

| 명령어                 | 용도                                   |
| ---------------------- | -------------------------------------- |
| `npm run format`       | Prettier로 코드와 문서 서식 정리       |
| `npm run format:check` | 서식 변경 없이 규칙 검사               |
| `npm run lint`         | JavaScript·HTML 내부 스크립트·CSS 검사 |
| `npm run lint:fix`     | 자동 수정 가능한 린트 오류 수정        |
| `npm test`             | 게임·입력·로딩·오디오 회귀 테스트      |
| `npm run check`        | 서식 검사 → 린트 → 전체 테스트         |

## 디렉터리

| 경로                                                | 역할                                         |
| --------------------------------------------------- | -------------------------------------------- |
| `dist/index.html`, `dist/style.css`, `dist/styles/` | 화면 구조와 기본·배경·카드·인트로 스타일     |
| `dist/app.js`                                       | 입력, UI, 렌더링 및 게임 흐름 연결           |
| `dist/game-core.js`                                 | 물리 시뮬레이션, 합성, 점수와 종료 판정      |
| `dist/merge-contact.js`, `dist/cat-outlines.js`     | 고양이 외곽선 접촉 판정과 생성된 윤곽 데이터 |
| `dist/intro.js`, `dist/audio.js`                    | 시작 애니메이션과 소리                       |
| `dist/assets/`                                      | 고양이, 배경, 로고와 음원                    |
| `dist/vendor/`                                      | 브라우저용 Matter.js 및 원본 라이선스        |
| `tests/`                                            | Node.js 테스트 러너를 사용하는 회귀 테스트   |

이 프로젝트의 **`dist/`는 직접 관리하는 소스 디렉터리**입니다. 일반적인 번들러의
임시 출력 디렉터리처럼 삭제하거나 `.gitignore`로 제외하지 않습니다.

## 작업 규칙

코딩·커밋 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md)에 정리되어 있습니다.
공통 에디터 설정, ESLint, Stylelint, Prettier 설정을 저장소에 포함합니다.
GitHub Actions에서 push와 pull request마다 `npm run check`를 실행합니다.

자동 테스트는 게임 로직과 모의 DOM·오디오 환경을 검증합니다. 실제 브라우저의
화면 배치, 모바일 터치, 소리 재생 품질은 별도의 수동 확인이 필요합니다.

## 외부 리소스

- Matter.js: `dist/vendor/MATTER-LICENSE.txt`
- 고양이 효과음 출처: `dist/assets/audio/CREDITS.txt`
