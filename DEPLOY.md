# 카트레이싱 웹 배포

이 프로젝트는 Express와 Socket.IO를 함께 쓰는 실시간 웹게임입니다. 정적 호스팅이나 서버리스보다, Node 서버를 계속 실행할 수 있는 Render, Railway, Fly.io 같은 플랫폼에 배포해야 합니다.

## Render 배포

1. GitHub 저장소를 Render에 연결합니다.
2. `render.yaml` Blueprint를 선택합니다.
3. 브랜치는 최신 코드가 올라간 브랜치를 선택합니다.
4. 배포가 끝나면 Render가 제공하는 공개 URL로 접속합니다.

설정값:

- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check Path: `/health`

## Railway 배포

1. GitHub 저장소에서 새 Railway 프로젝트를 만듭니다.
2. Public Networking에서 도메인을 생성합니다.
3. Start Command는 `npm start`를 사용합니다.
4. Health Check는 `/health`를 사용합니다.

서버는 클라우드 환경의 `PORT`를 사용하고 `0.0.0.0`에 바인딩합니다.
