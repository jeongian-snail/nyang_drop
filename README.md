# �ɳ� ���

���� �ܰ��� ������ ���� ���� ���� �ܰ�� ����� ������ �����Դϴ�.

- [�÷����ϱ�](https://jeongian-snail.github.io/nyang_drop/)
- JavaScript ES modules �� HTML �� CSS �� Matter.js
- ���� ������ ���� ���� ���� ���� ���Ϸ� �����մϴ�.

## GitHub Pages ����

���� �ּҴ� <https://jeongian-snail.github.io/nyang_drop/>�Դϴ�.

������� **Settings �� Pages �� Build and deployment �� Source**��
**GitHub Actions**�� �����մϴ�. `main`�� push�ϸ� ���� ���ġ���Ʈ���׽�Ʈ �˻縦
����� �� `dist/`�� ���� ���ϸ� �����մϴ�. Pull request�� �ٸ� �귣ġ������
�˻縸 �����ϸ� �������� �ʽ��ϴ�.

ó�� Pages�� Ȱ��ȭ�� �ڿ��� **Actions �� CI and GitHub Pages �� Run workflow**����
`main`�� ������ ������ �� �ֽ��ϴ�. ���Ŀ��� `main` ���� ������ �ڵ� �����˴ϴ�.
�˻簡 �����ϸ� �������� ������, ������ ������ ������ �����˴ϴ�.

������ �̹�������ũ��Ʈ�������� ��� ��θ� ����ϹǷ� `/nyang_drop/` �Ʒ�������
�����մϴ�. �ְ� ��ϰ� ���� ������ �湮�� �������� ����Ǹ�, ���� ����Ʈ��
����� �ּҰ� �޶� �ڵ� �������� �ʽ��ϴ�.

## ���� ȯ��

Node.js 24�� npm�� ����մϴ�. ������ ������ `package-lock.json`�� �����մϴ�.

```sh
npm ci
npm run check
```

������ ������ ���� ���� HTTP ������ ���� ��Ʈ�� `dist/`�� �����ϼ���.
Python�� ��ġ�Ǿ� �ִٸ� ���� ������ ����� �� �ֽ��ϴ�.

```sh
python3 -m http.server 8000 --directory dist
```

Windows������ `python3` ��� `py`�� ����� �� �ֽ��ϴ�.
���� �� `http://localhost:8000`�� �����ϼ���. ES modules�� ����ϹǷ�
`index.html`�� `file://` �ּҷ� ���� ���� ���� ������� �ʽ��ϴ�.

## ���ɾ�

| ���ɾ�                 | �뵵                                   |
| ---------------------- | -------------------------------------- |
| `npm run format`       | Prettier�� �ڵ�� ���� ���� ����       |
| `npm run format:check` | ���� ���� ���� ��Ģ �˻�               |
| `npm run lint`         | JavaScript��HTML ���� ��ũ��Ʈ��CSS �˻� |
| `npm run lint:fix`     | �ڵ� ���� ������ ��Ʈ ���� ����        |
| `npm test`             | ���ӡ��Է¡��ε�������� ȸ�� �׽�Ʈ      |
| `npm run check`        | ���� �˻� �� ��Ʈ �� ��ü �׽�Ʈ         |

## ���͸�

| ���                                                | ����                                         |
| --------------------------------------------------- | -------------------------------------------- |
| `dist/index.html`, `dist/style.css`, `dist/styles/` | ȭ�� ������ �⺻����桤ī�塤��Ʈ�� ��Ÿ��     |
| `dist/app.js`                                       | �Է�, UI, ������ �� ���� �帧 ����           |
| `dist/game-core.js`                                 | ���� �ùķ��̼�, �ռ�, ������ ���� ����      |
| `dist/merge-contact.js`, `dist/cat-outlines.js`     | ������ �ܰ��� ���� ������ ������ ���� ������ |
| `dist/intro.js`, `dist/audio.js`                    | ���� �ִϸ��̼ǰ� �Ҹ�                       |
| `dist/assets/`                                      | ������, ���, �ΰ��� ����                    |
| `dist/vendor/`                                      | �������� Matter.js �� ���� ���̼���        |
| `tests/`                                            | Node.js �׽�Ʈ ���ʸ� ����ϴ� ȸ�� �׽�Ʈ   |

�� ������Ʈ�� **`dist/`�� ���� �����ϴ� �ҽ� ���͸�**�Դϴ�. �Ϲ����� ���鷯��
�ӽ� ��� ���͸�ó�� �����ϰų� `.gitignore`�� �������� �ʽ��ϴ�.

## �۾� ��Ģ

�ڵ���Ŀ�� ��Ģ�� [CONTRIBUTING.md](CONTRIBUTING.md)�� �����Ǿ� �ֽ��ϴ�.
���� ������ ����, ESLint, Stylelint, Prettier ������ ����ҿ� �����մϴ�.
GitHub Actions���� push�� pull request���� `npm run check`�� �����մϴ�.

�ڵ� �׽�Ʈ�� ���� ������ ���� DOM������� ȯ���� �����մϴ�. ���� ��������
ȭ�� ��ġ, ����� ��ġ, �Ҹ� ��� ǰ���� ������ ���� Ȯ���� �ʿ��մϴ�.

## �ܺ� ���ҽ�

- Matter.js: `dist/vendor/MATTER-LICENSE.txt`
- ������ ȿ���� ��ó: `dist/assets/audio/CREDITS.txt`
