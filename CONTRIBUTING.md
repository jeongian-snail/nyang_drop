# 작업 규칙

## 코드 스타일

- UTF-8, LF 줄바꿈, 들여쓰기 2칸, 파일 끝 개행을 사용합니다.
- JavaScript는 ES modules, 작은따옴표, 세미콜론을 사용합니다.
- 변경하지 않는 바인딩은 `const`, 재할당하는 바인딩은 `let`을 사용합니다.
- 조건문과 반복문에는 중괄호를 붙이고 비교는 `===`, `!==`를 사용합니다.
- 함수·변수는 `camelCase`, 클래스는 `PascalCase`, 모듈 수준 상수는 `UPPER_SNAKE_CASE`를 사용합니다.
- CSS 클래스·사용자 정의 속성·키프레임·HTML ID·일반 파일명은 `kebab-case`를 사용합니다.
- 테스트 파일은 `*.test.mjs`, 개발 도구 설정은 해당 도구의 표준 파일명을 사용합니다.
- 기존 이미지·음원 파일명은 코드 참조와 해시 검증을 유지하기 위해 그대로 둡니다.
- 서식은 Prettier가 결정합니다. JavaScript의 오류 가능성은 ESLint, CSS의 오류 가능성은 Stylelint가 검사합니다.

일반 코드의 줄 길이는 100자를 기준으로 포맷합니다. URL 등 나누기 어려운 문자열까지
강제로 자르지는 않습니다. VS Code 권장 확장과 저장 시 포맷 설정은 `.vscode/`에 있습니다.

CSS는 `dist/style.css`가 `base → room → cards → intro` 순서로 불러옵니다.
반응형 재정의와 서로 다른 컴포넌트의 선택자를 전역 특이성 순서로 재정렬하지 않습니다.
따라서 Stylelint의 `no-descending-specificity`만 명시적으로 끄고, 중복 선택자·잘못된
속성·잘못된 값 검사는 유지합니다.

## 변경 순서

```sh
npm ci
# 코드 수정
npm run lint:fix
npm run format
npm run check
git diff --check
```

규칙을 통과시키기 위해 파일 전체의 린트를 끄지 않습니다. 예외가 꼭 필요하다면
가장 좁은 범위에 이유를 주석으로 남깁니다. 게임 동작을 변경할 때는 관련 회귀 테스트를
갱신하고, 화면이나 입력을 변경했다면 데스크톱·모바일 동작도 확인합니다.

## 자동 수정에서 제외하는 파일

- `dist/vendor/`: 외부 라이브러리와 라이선스 원본을 유지합니다.
- `dist/cat-outlines.js`: PNG 알파 채널에서 생성된 충돌 데이터입니다. 이미지와 데이터의 대응은 테스트에서 해시로 확인합니다.
- `package-lock.json`: npm이 관리하며 직접 포맷하지 않습니다.

이미지·음원은 바이너리로 취급합니다. 런타임용 `matter.min.js`를 업데이트할 때는
테스트용 `matter-js` 의존성도 같은 버전으로 맞춥니다.

## Git 관리

- `dist/`, `tests/`, 공통 설정, `package-lock.json`은 커밋합니다.
- `node_modules/`, 캐시, 테스트 보고서, 로그, `.env`와 로컬 호스팅 상태는 제외합니다.
- `.env.example`에는 실제 비밀 값을 넣지 않습니다.
- 의존성 추가 시 정확한 버전과 lockfile을 함께 커밋합니다.
- 작업 브랜치는 `feat/설명`, `fix/설명`, `chore/설명`처럼 목적을 드러냅니다.

커밋 메시지는 다음 형식을 사용합니다.

```text
type(scope): 변경 내용
```

`scope`는 생략할 수 있습니다. 타입은 `feat`, `fix`, `refactor`, `style`, `test`,
`docs`, `chore`, `ci`를 사용합니다.

```text
fix(game): prevent duplicate merges
style(ui): format game styles consistently
chore(tooling): unify lint and formatting rules
```

설명은 한국어 또는 영어로 작성할 수 있으며, 한 커밋은 하나의 목적을 담습니다.
