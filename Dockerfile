# 1. 빌드 스테이지
FROM node:20-slim AS builder
WORKDIR /app

# 하드웨어 제어 라이브러리 빌드를 위한 도구 설치
RUN apt-get update && apt-get install -y python3 make g++

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2. 실행 스테이지
FROM node:20-slim
WORKDIR /app

# 실행 환경에서도 i2c-bus 네이티브 모듈을 위해 필요할 수 있음
# (멀티스테이지 빌드 복사가 까다로울 수 있어, 간단히 프로덕션 deps 설치 방식으로 진행)
RUN apt-get update && apt-get install -y python3 make g++ i2c-tools

COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist

# 환경변수 설정 (옵션)
ENV NODE_ENV=production

# 시작 명령어
CMD ["node", "dist/index.js"]