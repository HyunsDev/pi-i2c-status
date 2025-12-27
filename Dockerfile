# 1. 빌드 스테이지
FROM node:20-slim AS builder
WORKDIR /app

# pnpm 활성화
RUN corepack enable

# 네이티브 모듈(i2c-bus) 빌드 도구 설치
RUN apt-get update && apt-get install -y python3 make g++

# 패키지 파일 복사 (pnpm-lock.yaml 포함)
COPY package.json pnpm-lock.yaml ./

# 의존성 설치 (npm ci 대신 사용)
RUN pnpm install --frozen-lockfile

# 소스 복사 및 빌드
COPY . .
RUN pnpm run build

# 2. 실행 스테이지
FROM node:20-slim
WORKDIR /app

# pnpm 활성화
RUN corepack enable

# 런타임에 필요한 네이티브 빌드 도구 및 I2C 툴 설치
# (i2c-bus가 런타임 설치 시 재빌드될 수 있으므로 빌드 도구 유지)
RUN apt-get update && apt-get install -y python3 make g++ i2c-tools

# 프로덕션 의존성만 설치하기 위해 패키지 파일 복사
COPY package.json pnpm-lock.yaml ./

# 프로덕션 의존성만 설치 (--prod)
RUN pnpm install --prod --frozen-lockfile

# 빌드 결과물 복사
COPY --from=builder /app/dist ./dist

# 환경변수 설정
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]